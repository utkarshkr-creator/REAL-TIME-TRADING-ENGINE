package orderbook

import (
	"fmt"

	"exchangeManager/internal/types"
)

type Orderbook struct {
	Bids         []types.Order
	Asks         []types.Order
	StopBids     []types.Order
	StopAsks     []types.Order
	QuoteAsset   string
	BaseAsset    string
	LastTradeId  int64
	CurrentPrice int64
	Tasks        chan func() `json:"-"`
}

func NewOrderbook(baseAsset string, quoteAsset string, bids []types.Order, asks []types.Order, lastTradeId int64, currentPrice int64) *Orderbook {
	ob := &Orderbook{
		Bids:         bids,
		Asks:         asks,
		StopBids:     make([]types.Order, 0),
		StopAsks:     make([]types.Order, 0),
		BaseAsset:    baseAsset,
		LastTradeId:  lastTradeId,
		QuoteAsset:   quoteAsset,
		CurrentPrice: currentPrice,
		Tasks:        make(chan func(), 1000), // Buffered channel for tasks
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

func (ob *Orderbook) GetSnapshot() types.OrderbookSnapshot {
	return types.OrderbookSnapshot{
		BaseAsset:    ob.BaseAsset,
		QuoteAsset:   ob.QuoteAsset,
		Bids:         ob.Bids,
		Asks:         ob.Asks,
		LastTradeId:  ob.LastTradeId,
		CurrentPrice: ob.CurrentPrice,
	}
}

func (ob *Orderbook) AddOrder(order types.Order) types.Order {
	// 1) Park Stop Orders if TriggerPrice hasn't been hit yet
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
		// If trigger already met (e.g. LTP is already 100 on a >90 stop buy), execute immediately
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
			// Market buy: sweep asks at any price
			executedQty, fills = ob.matchBidMarket(order)
		case types.OrderTypePostOnly:
			// Post-Only: reject if it would match immediately
			if len(ob.Asks) > 0 && ob.Asks[0].Price <= order.Price && ob.Asks[0].UserID != order.UserID {
				order.Rejected = true
				return order
			}
			executedQty, fills = 0, nil
		default:
			// Limit buy (also covers IOC)
			executedQty, fills = ob.matchBid(order)
		}

		order.Fills = fills
		order.ExecutedQty = executedQty

		rests := order.Type != types.OrderTypeMarket && order.Type != types.OrderTypeIOC && !order.Rejected
		if rests && executedQty < order.Quantity {
			remaining := order
			remaining.Quantity = order.Quantity
			idx := len(ob.Bids)
			for i := 0; i < len(ob.Bids); i++ {
				if ob.Bids[i].Price < order.Price {
					idx = i
					break
				}
			}
			ob.Bids = append(ob.Bids, types.Order{})
			copy(ob.Bids[idx+1:], ob.Bids[idx:])
			ob.Bids[idx] = remaining
		}

	} else if order.Side == types.SideSell {
		var executedQty int64
		var fills []types.Fill

		switch order.Type {
		case types.OrderTypeMarket:
			// Market sell: sweep bids at any price
			executedQty, fills = ob.matchAskMarket(order)
		case types.OrderTypePostOnly:
			// Post-Only: reject if it would match immediately
			if len(ob.Bids) > 0 && ob.Bids[0].Price >= order.Price && ob.Bids[0].UserID != order.UserID {
				order.Rejected = true
				return order
			}
			executedQty, fills = 0, nil
		default:
			// Limit sell (also covers IOC)
			executedQty, fills = ob.matchAsk(order)
		}

		order.Fills = fills
		order.ExecutedQty = executedQty

		rests := order.Type != types.OrderTypeMarket && order.Type != types.OrderTypeIOC && !order.Rejected
		if rests && executedQty < order.Quantity {
			remaining := order
			remaining.Quantity = order.Quantity
			idx := len(ob.Asks)
			for i := 0; i < len(ob.Asks); i++ {
				if ob.Asks[i].Price > order.Price {
					idx = i
					break
				}
			}
			ob.Asks = append(ob.Asks, types.Order{})
			copy(ob.Asks[idx+1:], ob.Asks[idx:])
			ob.Asks[idx] = remaining
		}
	}

	// 2) After processing this order's standard fills, LTP might have moved.
	// We must evaluate if any parked Stop orders were triggered.
	ob.evaluateStopOrders()

	return order
}

func (ob *Orderbook) matchBid(order types.Order) (int64, []types.Fill) {
	var fills []types.Fill
	var executedQty int64

	for i := 0; i < len(ob.Asks) && executedQty < order.Quantity; i++ {
		ask := &ob.Asks[i]
		if ask.UserID != order.UserID && ask.Price <= order.Price {
			available := ask.Quantity - ask.ExecutedQty
			remaining := order.Quantity - executedQty
			filledQty := min64(remaining, available)
			executedQty += filledQty
			ask.ExecutedQty += filledQty
			if ask.ExecutedQty >= ask.Quantity {
				ob.CurrentPrice = ask.Price
			}
			fills = append(fills, types.Fill{
				Price:         ask.Price,
				Quantity:      filledQty,
				TradeId:       ob.LastTradeId,
				OtherUserId:   ask.UserID,
				MarketOrderId: ask.OrderID,
			})
			ob.LastTradeId++
		}
	}
	cleaned := ob.Asks[:0]
	for _, ask := range ob.Asks {
		if ask.ExecutedQty < ask.Quantity {
			cleaned = append(cleaned, ask)
		}
	}
	ob.Asks = cleaned
	return executedQty, fills
}

// matchBidMarket sweeps asks at ANY price — used for market buy orders
func (ob *Orderbook) matchBidMarket(order types.Order) (int64, []types.Fill) {
	var fills []types.Fill
	var executedQty int64

	for i := 0; i < len(ob.Asks) && executedQty < order.Quantity; i++ {
		ask := &ob.Asks[i]
		if ask.UserID != order.UserID {
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
		}
	}
	cleaned := ob.Asks[:0]
	for _, ask := range ob.Asks {
		if ask.ExecutedQty < ask.Quantity {
			cleaned = append(cleaned, ask)
		}
	}
	ob.Asks = cleaned
	return executedQty, fills
}

func (ob *Orderbook) matchAsk(order types.Order) (int64, []types.Fill) {
	var fills []types.Fill
	var executedQty int64

	for i := 0; i < len(ob.Bids) && executedQty < order.Quantity; i++ {
		bid := &ob.Bids[i]
		if bid.UserID != order.UserID && bid.Price >= order.Price {
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
		}
	}

	// Remove fully filled bids
	cleaned := ob.Bids[:0]
	for _, bid := range ob.Bids {
		if bid.ExecutedQty < bid.Quantity {
			cleaned = append(cleaned, bid)
		}
	}
	ob.Bids = cleaned

	return executedQty, fills
}

// matchAskMarket sweeps bids at ANY price — used for market sell orders
func (ob *Orderbook) matchAskMarket(order types.Order) (int64, []types.Fill) {
	var fills []types.Fill
	var executedQty int64

	for i := 0; i < len(ob.Bids) && executedQty < order.Quantity; i++ {
		bid := &ob.Bids[i]
		if bid.UserID != order.UserID {
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
		}
	}
	cleaned := ob.Bids[:0]
	for _, bid := range ob.Bids {
		if bid.ExecutedQty < bid.Quantity {
			cleaned = append(cleaned, bid)
		}
	}
	ob.Bids = cleaned
	return executedQty, fills
}

func min64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

func (ob *Orderbook) GetDepth() types.DepthMessage {
	// Aggregate quantities at each price level (matching TS getDepth)
	bidsObj := make(map[int64]int64)
	for _, bid := range ob.Bids {
		bidsObj[bid.Price] += bid.Quantity
	}
	asksObj := make(map[int64]int64)
	for _, ask := range ob.Asks {
		asksObj[ask.Price] += ask.Quantity
	}

	bids := make([][2]string, 0, len(bidsObj))
	for price, qty := range bidsObj {
		bids = append(bids, [2]string{fmt.Sprintf("%d", price), fmt.Sprintf("%d", qty)})
	}

	asks := make([][2]string, 0, len(asksObj))
	for price, qty := range asksObj {
		asks = append(asks, [2]string{fmt.Sprintf("%d", price), fmt.Sprintf("%d", qty)})
	}

	return types.DepthMessage{
		Bids: bids,
		Asks: asks,
	}
}

func (ob *Orderbook) GetPrice() int64 {
	return ob.CurrentPrice
}

func (ob *Orderbook) GetOpenOrders(userId string) []types.Order {
	var orders []types.Order
	for _, ask := range ob.Asks {
		if ask.UserID == userId {
			orders = append(orders, ask)
		}
	}
	for _, bid := range ob.Bids {
		if bid.UserID == userId {
			orders = append(orders, bid)
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

func (ob *Orderbook) CancelBid(orderId string) (int64, bool) {
	for i, bid := range ob.Bids {
		if bid.OrderID == orderId {
			price := bid.Price
			ob.Bids = append(ob.Bids[:i], ob.Bids[i+1:]...)
			return price, true
		}
	}
	return 0, false
}

func (ob *Orderbook) CancelAsk(orderId string) (int64, bool) {
	for i, ask := range ob.Asks {
		if ask.OrderID == orderId {
			price := ask.Price
			ob.Asks = append(ob.Asks[:i], ob.Asks[i+1:]...)
			return price, true
		}
	}
	return 0, false
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

func (ob *Orderbook) evaluateStopOrders() {
	// A triggered stop order will call AddOrder, which might trigger MORE stop orders recursively.
	// To prevent infinite recursions or concurrent modification slices, we gather triggered ones first:
	var triggeredBids []types.Order
	var triggeredAsks []types.Order

	remainingStopBids := ob.StopBids[:0]
	for _, bid := range ob.StopBids {
		if ob.CurrentPrice >= bid.TriggerPrice {
			triggeredBids = append(triggeredBids, bid)
		} else {
			remainingStopBids = append(remainingStopBids, bid)
		}
	}
	ob.StopBids = remainingStopBids

	remainingStopAsks := ob.StopAsks[:0]
	for _, ask := range ob.StopAsks {
		if ob.CurrentPrice <= ask.TriggerPrice {
			triggeredAsks = append(triggeredAsks, ask)
		} else {
			remainingStopAsks = append(remainingStopAsks, ask)
		}
	}
	ob.StopAsks = remainingStopAsks

	// Now place the triggered orders as live Market or Limit orders
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
