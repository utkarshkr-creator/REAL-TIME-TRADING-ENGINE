package orderbook

import (
	"container/heap"
	"fmt"
	"sort"

	"exchangeManager/internal/types"
)

// ─── Price-level heaps ────────────────────────────────────────────────────────

// bidPriceHeap is a max-heap of int64 prices (highest bid at top).
type bidPriceHeap []int64

func (h bidPriceHeap) Len() int            { return len(h) }
func (h bidPriceHeap) Less(i, j int) bool  { return h[i] > h[j] } // max-heap
func (h bidPriceHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *bidPriceHeap) Push(x interface{}) { *h = append(*h, x.(int64)) }
func (h *bidPriceHeap) Pop() interface{} {
	old := *h
	n := len(old)
	x := old[n-1]
	*h = old[:n-1]
	return x
}

// askPriceHeap is a min-heap of int64 prices (lowest ask at top).
type askPriceHeap []int64

func (h askPriceHeap) Len() int            { return len(h) }
func (h askPriceHeap) Less(i, j int) bool  { return h[i] < h[j] } // min-heap
func (h askPriceHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *askPriceHeap) Push(x interface{}) { *h = append(*h, x.(int64)) }
func (h *askPriceHeap) Pop() interface{} {
	old := *h
	n := len(old)
	x := old[n-1]
	*h = old[:n-1]
	return x
}

// ─── Price level ──────────────────────────────────────────────────────────────

// priceLevel is a FIFO queue of orders at a single price point.
// head tracks the first unconsumed entry to avoid O(n) re-slicing.
type priceLevel struct {
	orders []types.Order
	head   int // index of first active order
}

// advance skips cancelled / fully-filled entries at the front.
func (pl *priceLevel) advance(cancelled map[string]struct{}) {
	for pl.head < len(pl.orders) {
		o := &pl.orders[pl.head]
		_, isCancelled := cancelled[o.OrderID]
		if isCancelled || o.ExecutedQty >= o.Quantity {
			pl.head++
		} else {
			break
		}
	}
}

// active returns a pointer to the best (front) active order, or nil.
func (pl *priceLevel) active(cancelled map[string]struct{}) *types.Order {
	pl.advance(cancelled)
	if pl.head >= len(pl.orders) {
		return nil
	}
	return &pl.orders[pl.head]
}

// isEmpty reports whether there are no more active orders at this level.
func (pl *priceLevel) isEmpty(cancelled map[string]struct{}) bool {
	return pl.active(cancelled) == nil
}

// totalQty returns remaining quantity across all active orders (for depth).
func (pl *priceLevel) totalQty(cancelled map[string]struct{}) int64 {
	var total int64
	for i := pl.head; i < len(pl.orders); i++ {
		o := &pl.orders[i]
		_, isCancelled := cancelled[o.OrderID]
		if !isCancelled {
			total += o.Quantity - o.ExecutedQty
		}
	}
	return total
}

// ─── Orderbook ────────────────────────────────────────────────────────────────

type Orderbook struct {
	// Internal hot-path structures
	bidLevels  map[int64]*priceLevel
	askLevels  map[int64]*priceLevel
	bidHeap    bidPriceHeap // may contain stale prices (lazy-deleted)
	askHeap    askPriceHeap // may contain stale prices (lazy-deleted)
	orderPrice map[string]int64       // orderID → price  (O(1) cancel lookup)
	orderSide  map[string]types.Side  // orderID → side   (O(1) cancel routing)
	cancelled  map[string]struct{}    // set of cancelled order IDs

	// Stop orders (low volume; linear scan is acceptable)
	StopBids []types.Order
	StopAsks []types.Order

	// Metadata
	BaseAsset    string
	QuoteAsset   string
	LastTradeId  int64
	CurrentPrice int64
	Tasks        chan func() `json:"-"`
}

func NewOrderbook(baseAsset, quoteAsset string, bids, asks []types.Order, lastTradeId, currentPrice int64) *Orderbook {
	ob := &Orderbook{
		bidLevels:    make(map[int64]*priceLevel),
		askLevels:    make(map[int64]*priceLevel),
		bidHeap:      make(bidPriceHeap, 0),
		askHeap:      make(askPriceHeap, 0),
		orderPrice:   make(map[string]int64),
		orderSide:    make(map[string]types.Side),
		cancelled:    make(map[string]struct{}),
		StopBids:     make([]types.Order, 0),
		StopAsks:     make([]types.Order, 0),
		BaseAsset:    baseAsset,
		QuoteAsset:   quoteAsset,
		LastTradeId:  lastTradeId,
		CurrentPrice: currentPrice,
		Tasks:        make(chan func(), 1000),
	}
	// Seed from snapshot (bids/asks already sorted)
	for _, o := range bids {
		ob.restingInsert(o, types.SideBuy)
	}
	for _, o := range asks {
		ob.restingInsert(o, types.SideSell)
	}
	go ob.Start()
	return ob
}

func (ob *Orderbook) Start() {
	for task := range ob.Tasks {
		task()
	}
}

func (ob *Orderbook) Ticker() string {
	return ob.BaseAsset + "_" + ob.QuoteAsset
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

// restingInsert places an order into the appropriate price-level map + heap.
func (ob *Orderbook) restingInsert(order types.Order, side types.Side) {
	price := order.Price
	ob.orderPrice[order.OrderID] = price
	ob.orderSide[order.OrderID] = side

	if side == types.SideBuy {
		pl, exists := ob.bidLevels[price]
		if !exists {
			pl = &priceLevel{}
			ob.bidLevels[price] = pl
			heap.Push(&ob.bidHeap, price)
		}
		pl.orders = append(pl.orders, order)
	} else {
		pl, exists := ob.askLevels[price]
		if !exists {
			pl = &priceLevel{}
			ob.askLevels[price] = pl
			heap.Push(&ob.askHeap, price)
		}
		pl.orders = append(pl.orders, order)
	}
}

// bestAskPrice returns the current best ask price, lazily evicting empty levels.
// Returns 0 if no asks.
func (ob *Orderbook) bestAskPrice() int64 {
	for ob.askHeap.Len() > 0 {
		price := ob.askHeap[0]
		pl := ob.askLevels[price]
		if pl == nil || pl.isEmpty(ob.cancelled) {
			heap.Pop(&ob.askHeap)
			delete(ob.askLevels, price)
			continue
		}
		return price
	}
	return 0
}

// bestBidPrice returns the current best bid price, lazily evicting empty levels.
// Returns 0 if no bids.
func (ob *Orderbook) bestBidPrice() int64 {
	for ob.bidHeap.Len() > 0 {
		price := ob.bidHeap[0]
		pl := ob.bidLevels[price]
		if pl == nil || pl.isEmpty(ob.cancelled) {
			heap.Pop(&ob.bidHeap)
			delete(ob.bidLevels, price)
			continue
		}
		return price
	}
	return 0
}

// ─── AddOrder ─────────────────────────────────────────────────────────────────

func (ob *Orderbook) AddOrder(order types.Order) types.Order {
	// 1) Park stop orders if trigger hasn't been hit
	if order.Type == types.OrderTypeStopLimit || order.Type == types.OrderTypeStopMarket {
		if order.Side == types.SideBuy {
			if ob.CurrentPrice < order.TriggerPrice {
				ob.StopBids = append(ob.StopBids, order)
				return order
			}
		} else {
			if ob.CurrentPrice > order.TriggerPrice {
				ob.StopAsks = append(ob.StopAsks, order)
				return order
			}
		}
		// Trigger already met — downgrade to limit/market
		if order.Type == types.OrderTypeStopLimit {
			order.Type = types.OrderTypeLimit
		} else {
			order.Type = types.OrderTypeMarket
		}
	}

	if order.Side == types.SideBuy {
		var executedQty int64
		var fills []types.Fill

		switch order.Type {
		case types.OrderTypeMarket:
			executedQty, fills = ob.matchBidMarket(order)
		case types.OrderTypePostOnly:
			bestAsk := ob.bestAskPrice()
			if bestAsk > 0 {
				pl := ob.askLevels[bestAsk]
				if front := pl.active(ob.cancelled); front != nil && front.Price <= order.Price && front.UserID != order.UserID {
					order.Rejected = true
					return order
				}
			}
			executedQty, fills = 0, nil
		default: // limit, IOC
			executedQty, fills = ob.matchBid(order)
		}

		order.Fills = fills
		order.ExecutedQty = executedQty

		rests := order.Type != types.OrderTypeMarket && order.Type != types.OrderTypeIOC && !order.Rejected
		if rests && executedQty < order.Quantity {
			ob.restingInsert(order, types.SideBuy)
		}

	} else if order.Side == types.SideSell {
		var executedQty int64
		var fills []types.Fill

		switch order.Type {
		case types.OrderTypeMarket:
			executedQty, fills = ob.matchAskMarket(order)
		case types.OrderTypePostOnly:
			bestBid := ob.bestBidPrice()
			if bestBid > 0 {
				pl := ob.bidLevels[bestBid]
				if front := pl.active(ob.cancelled); front != nil && front.Price >= order.Price && front.UserID != order.UserID {
					order.Rejected = true
					return order
				}
			}
			executedQty, fills = 0, nil
		default: // limit, IOC
			executedQty, fills = ob.matchAsk(order)
		}

		order.Fills = fills
		order.ExecutedQty = executedQty

		rests := order.Type != types.OrderTypeMarket && order.Type != types.OrderTypeIOC && !order.Rejected
		if rests && executedQty < order.Quantity {
			ob.restingInsert(order, types.SideSell)
		}
	}

	ob.evaluateStopOrders()
	return order
}

// ─── Matching engines ─────────────────────────────────────────────────────────

func (ob *Orderbook) matchBid(order types.Order) (int64, []types.Fill) {
	var fills []types.Fill
	var executedQty int64

	for executedQty < order.Quantity {
		bestAsk := ob.bestAskPrice()
		if bestAsk == 0 || bestAsk > order.Price {
			break
		}
		pl := ob.askLevels[bestAsk]
		ask := pl.active(ob.cancelled)
		if ask == nil {
			break
		}
		if ask.UserID == order.UserID {
			// Self-trade: skip this level entirely (advance past it)
			pl.head++
			continue
		}

		available := ask.Quantity - ask.ExecutedQty
		remaining := order.Quantity - executedQty
		filledQty := min64(remaining, available)

		executedQty += filledQty
		ask.ExecutedQty += filledQty
		ob.CurrentPrice = ask.Price

		fills = append(fills, types.Fill{
			Price:         ask.Price,
			Quantity:      filledQty,
			TradeId:       ob.LastTradeId,
			OtherUserId:   ask.UserID,
			MarketOrderId: ask.OrderID,
		})
		ob.LastTradeId++

		if ask.ExecutedQty >= ask.Quantity {
			pl.head++ // consume fully-filled order
		}
	}
	return executedQty, fills
}

func (ob *Orderbook) matchBidMarket(order types.Order) (int64, []types.Fill) {
	var fills []types.Fill
	var executedQty int64

	for executedQty < order.Quantity {
		bestAsk := ob.bestAskPrice()
		if bestAsk == 0 {
			break
		}
		pl := ob.askLevels[bestAsk]
		ask := pl.active(ob.cancelled)
		if ask == nil {
			break
		}
		if ask.UserID == order.UserID {
			pl.head++
			continue
		}

		available := ask.Quantity - ask.ExecutedQty
		remaining := order.Quantity - executedQty
		filledQty := min64(remaining, available)

		executedQty += filledQty
		ask.ExecutedQty += filledQty
		ob.CurrentPrice = ask.Price

		fills = append(fills, types.Fill{
			Price:         ask.Price,
			Quantity:      filledQty,
			TradeId:       ob.LastTradeId,
			OtherUserId:   ask.UserID,
			MarketOrderId: ask.OrderID,
		})
		ob.LastTradeId++

		if ask.ExecutedQty >= ask.Quantity {
			pl.head++
		}
	}
	return executedQty, fills
}

func (ob *Orderbook) matchAsk(order types.Order) (int64, []types.Fill) {
	var fills []types.Fill
	var executedQty int64

	for executedQty < order.Quantity {
		bestBid := ob.bestBidPrice()
		if bestBid == 0 || bestBid < order.Price {
			break
		}
		pl := ob.bidLevels[bestBid]
		bid := pl.active(ob.cancelled)
		if bid == nil {
			break
		}
		if bid.UserID == order.UserID {
			pl.head++
			continue
		}

		available := bid.Quantity - bid.ExecutedQty
		remaining := order.Quantity - executedQty
		filledQty := min64(remaining, available)

		executedQty += filledQty
		bid.ExecutedQty += filledQty
		ob.CurrentPrice = bid.Price

		fills = append(fills, types.Fill{
			Price:         bid.Price,
			Quantity:      filledQty,
			TradeId:       ob.LastTradeId,
			OtherUserId:   bid.UserID,
			MarketOrderId: bid.OrderID,
		})
		ob.LastTradeId++

		if bid.ExecutedQty >= bid.Quantity {
			pl.head++
		}
	}
	return executedQty, fills
}

func (ob *Orderbook) matchAskMarket(order types.Order) (int64, []types.Fill) {
	var fills []types.Fill
	var executedQty int64

	for executedQty < order.Quantity {
		bestBid := ob.bestBidPrice()
		if bestBid == 0 {
			break
		}
		pl := ob.bidLevels[bestBid]
		bid := pl.active(ob.cancelled)
		if bid == nil {
			break
		}
		if bid.UserID == order.UserID {
			pl.head++
			continue
		}

		available := bid.Quantity - bid.ExecutedQty
		remaining := order.Quantity - executedQty
		filledQty := min64(remaining, available)

		executedQty += filledQty
		bid.ExecutedQty += filledQty
		ob.CurrentPrice = bid.Price

		fills = append(fills, types.Fill{
			Price:         bid.Price,
			Quantity:      filledQty,
			TradeId:       ob.LastTradeId,
			OtherUserId:   bid.UserID,
			MarketOrderId: bid.OrderID,
		})
		ob.LastTradeId++

		if bid.ExecutedQty >= bid.Quantity {
			pl.head++
		}
	}
	return executedQty, fills
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

// CancelBid cancels a bid order by ID in O(1). Returns (price, found).
func (ob *Orderbook) CancelBid(orderId string) (int64, bool) {
	price, ok := ob.orderPrice[orderId]
	if !ok {
		return 0, false
	}
	side, _ := ob.orderSide[orderId]
	if side != types.SideBuy {
		return 0, false
	}
	ob.cancelled[orderId] = struct{}{}
	delete(ob.orderPrice, orderId)
	delete(ob.orderSide, orderId)
	return price, true
}

// CancelAsk cancels an ask order by ID in O(1). Returns (price, found).
func (ob *Orderbook) CancelAsk(orderId string) (int64, bool) {
	price, ok := ob.orderPrice[orderId]
	if !ok {
		return 0, false
	}
	side, _ := ob.orderSide[orderId]
	if side != types.SideSell {
		return 0, false
	}
	ob.cancelled[orderId] = struct{}{}
	delete(ob.orderPrice, orderId)
	delete(ob.orderSide, orderId)
	return price, true
}

func (ob *Orderbook) CancelStopBid(orderId string) (int64, bool) {
	for i, bid := range ob.StopBids {
		if bid.OrderID == orderId {
			price := bid.Price
			ob.StopBids = append(ob.StopBids[:i], ob.StopBids[i+1:]...)
			return price, true
		}
	}
	return 0, false
}

func (ob *Orderbook) CancelStopAsk(orderId string) (int64, bool) {
	for i, ask := range ob.StopAsks {
		if ask.OrderID == orderId {
			price := ask.Price
			ob.StopAsks = append(ob.StopAsks[:i], ob.StopAsks[i+1:]...)
			return price, true
		}
	}
	return 0, false
}

// ─── Stop order evaluation ────────────────────────────────────────────────────

func (ob *Orderbook) evaluateStopOrders() {
	var triggeredBids, triggeredAsks []types.Order

	remaining := ob.StopBids[:0]
	for _, bid := range ob.StopBids {
		if ob.CurrentPrice >= bid.TriggerPrice {
			triggeredBids = append(triggeredBids, bid)
		} else {
			remaining = append(remaining, bid)
		}
	}
	ob.StopBids = remaining

	remaining = ob.StopAsks[:0]
	for _, ask := range ob.StopAsks {
		if ob.CurrentPrice <= ask.TriggerPrice {
			triggeredAsks = append(triggeredAsks, ask)
		} else {
			remaining = append(remaining, ask)
		}
	}
	ob.StopAsks = remaining

	for _, bid := range triggeredBids {
		if bid.Type == types.OrderTypeStopLimit {
			bid.Type = types.OrderTypeLimit
		} else {
			bid.Type = types.OrderTypeMarket
		}
		ob.AddOrder(bid)
	}
	for _, ask := range triggeredAsks {
		if ask.Type == types.OrderTypeStopLimit {
			ask.Type = types.OrderTypeLimit
		} else {
			ask.Type = types.OrderTypeMarket
		}
		ob.AddOrder(ask)
	}
}

// ─── Read-only views ──────────────────────────────────────────────────────────

// GetBids returns all active bids as a sorted slice (descending by price).
// O(n log n) — not on the hot path; used for snapshots / tests.
func (ob *Orderbook) GetBids() []types.Order {
	prices := make([]int64, 0, len(ob.bidLevels))
	for p := range ob.bidLevels {
		prices = append(prices, p)
	}
	sort.Slice(prices, func(i, j int) bool { return prices[i] > prices[j] })

	var result []types.Order
	for _, p := range prices {
		pl := ob.bidLevels[p]
		for i := pl.head; i < len(pl.orders); i++ {
			o := pl.orders[i]
			if _, cancelled := ob.cancelled[o.OrderID]; !cancelled && o.ExecutedQty < o.Quantity {
				result = append(result, o)
			}
		}
	}
	return result
}

// GetAsks returns all active asks as a sorted slice (ascending by price).
// O(n log n) — not on the hot path; used for snapshots / tests.
func (ob *Orderbook) GetAsks() []types.Order {
	prices := make([]int64, 0, len(ob.askLevels))
	for p := range ob.askLevels {
		prices = append(prices, p)
	}
	sort.Slice(prices, func(i, j int) bool { return prices[i] < prices[j] })

	var result []types.Order
	for _, p := range prices {
		pl := ob.askLevels[p]
		for i := pl.head; i < len(pl.orders); i++ {
			o := pl.orders[i]
			if _, cancelled := ob.cancelled[o.OrderID]; !cancelled && o.ExecutedQty < o.Quantity {
				result = append(result, o)
			}
		}
	}
	return result
}

func (ob *Orderbook) GetSnapshot() types.OrderbookSnapshot {
	return types.OrderbookSnapshot{
		BaseAsset:    ob.BaseAsset,
		QuoteAsset:   ob.QuoteAsset,
		Bids:         ob.GetBids(),
		Asks:         ob.GetAsks(),
		LastTradeId:  ob.LastTradeId,
		CurrentPrice: ob.CurrentPrice,
	}
}

func (ob *Orderbook) GetDepth() types.DepthMessage {
	bidsObj := make(map[int64]int64)
	for price, pl := range ob.bidLevels {
		if qty := pl.totalQty(ob.cancelled); qty > 0 {
			bidsObj[price] += qty
		}
	}
	asksObj := make(map[int64]int64)
	for price, pl := range ob.askLevels {
		if qty := pl.totalQty(ob.cancelled); qty > 0 {
			asksObj[price] += qty
		}
	}

	bids := make([][2]string, 0, len(bidsObj))
	for price, qty := range bidsObj {
		bids = append(bids, [2]string{fmt.Sprintf("%d", price), fmt.Sprintf("%d", qty)})
	}
	asks := make([][2]string, 0, len(asksObj))
	for price, qty := range asksObj {
		asks = append(asks, [2]string{fmt.Sprintf("%d", price), fmt.Sprintf("%d", qty)})
	}

	return types.DepthMessage{Bids: bids, Asks: asks}
}

func (ob *Orderbook) GetPrice() int64 {
	return ob.CurrentPrice
}

// BestAsk returns the lowest active ask price (exported for engine.go).
// Must be called from within the ob.Tasks goroutine.
func (ob *Orderbook) BestAsk() int64 {
	return ob.bestAskPrice()
}

// FindOrder looks up an order by ID using O(1) maps.
// Returns (order pointer, side). Must be called from within the ob.Tasks goroutine.
// The returned pointer references the order inside the price-level slice; it is valid
// only while the Tasks goroutine holds control.
func (ob *Orderbook) FindOrder(orderId string) (*types.Order, types.Side) {
	price, ok := ob.orderPrice[orderId]
	if !ok {
		return nil, ""
	}
	side := ob.orderSide[orderId]
	if side == types.SideBuy {
		pl, exists := ob.bidLevels[price]
		if !exists {
			return nil, ""
		}
		for i := range pl.orders {
			if pl.orders[i].OrderID == orderId {
				return &pl.orders[i], side
			}
		}
	} else {
		pl, exists := ob.askLevels[price]
		if !exists {
			return nil, ""
		}
		for i := range pl.orders {
			if pl.orders[i].OrderID == orderId {
				return &pl.orders[i], side
			}
		}
	}
	return nil, ""
}

func (ob *Orderbook) GetOpenOrders(userId string) []types.Order {
	var orders []types.Order
	for _, pl := range ob.askLevels {
		for i := pl.head; i < len(pl.orders); i++ {
			o := pl.orders[i]
			if _, cancelled := ob.cancelled[o.OrderID]; !cancelled && o.UserID == userId && o.ExecutedQty < o.Quantity {
				orders = append(orders, o)
			}
		}
	}
	for _, pl := range ob.bidLevels {
		for i := pl.head; i < len(pl.orders); i++ {
			o := pl.orders[i]
			if _, cancelled := ob.cancelled[o.OrderID]; !cancelled && o.UserID == userId && o.ExecutedQty < o.Quantity {
				orders = append(orders, o)
			}
		}
	}
	for _, ask := range ob.StopAsks {
		if ask.UserID == userId {
			orders = append(orders, ask)
		}
	}
	for _, bid := range ob.StopBids {
		if bid.UserID == userId {
			orders = append(orders, bid)
		}
	}
	return orders
}

func min64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}
