package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand"
	"os"
	"strconv"
	"strings"
	"time"

	"exchangeManager/internal/orderbook"
	redismgr "exchangeManager/internal/redis"
	"exchangeManager/internal/types"
	"sync"
)

const BaseCurrency = types.BaseCurrency
const ScalingFactor = 1000000 // Match DECIMAL_PRECISION = 6 (10^6)

type Engine struct {
	Orderbooks   []*orderbook.Orderbook       `json:"orderbooks"`
	orderbooksMu sync.RWMutex                 `json:"-"`
	PriceList    map[string]int64             `json:"priceList"`
	Balances     map[string]types.UserBalance `json:"balances"`
	balanceMu    sync.RWMutex                 `json:"-"`
}

func saveSnapshot(engine *Engine) {
	data, err := json.MarshalIndent(engine, "", "  ")
	if err != nil {
		slog.Error("Failed to marshal snapshot:", "error", err)
		return
	}
	// Ensure the data directory exists
	if err := os.MkdirAll("data", 0755); err != nil {
		slog.Error("Failed to create data directory:", "error", err)
	}

	if err := os.WriteFile("data/snapshot.json", data, 0644); err != nil {
		slog.Error("Failed to write snapshot:", "error", err)
	}
}

func NewEngine() (*Engine, error) {
	var engine *Engine

	if os.Getenv("WITH_SNAPSHOT") == "true" {
		data, err := os.ReadFile("data/snapshot.json")
		if err != nil {
			slog.Error("No snapshot found:", "error", err)
		} else {
			if err := json.Unmarshal(data, &engine); err != nil {
				slog.Error("Failed to parse snapshot:", "error", err)
			} else {
				// Re-initialize channels and background routines for restored orderbooks
				for _, ob := range engine.Orderbooks {
					ob.Tasks = make(chan func(), 1000)
					go ob.Start()
				}
			}
		}
	}

	if engine == nil {
		engine = &Engine{
			Orderbooks: []*orderbook.Orderbook{orderbook.NewOrderbook("TATA", "INR", nil, nil, 0, 138)},
			PriceList:  map[string]int64{"TATA": 138},
			Balances:   make(map[string]types.UserBalance),
		}

		// Hardcoded base balances for testing / market maker setup
		users := []string{"1", "2", "3", "6", "7", "admin"}
		for _, u := range users {
			engine.Balances[u] = types.UserBalance{
				"INR":  {Available: 10000000 * ScalingFactor, Locked: 0},
				"TATA": {Available: 10000000 * ScalingFactor, Locked: 0},
			}
		}
	}

	// Periodic snapshot saving in the background.
	go func() {
		ticker := time.NewTicker(3 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			saveSnapshot(engine)
		}
	}()

	return engine, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func (e *Engine) addOrderbook(ob *orderbook.Orderbook) {
	e.orderbooksMu.Lock()
	defer e.orderbooksMu.Unlock()
	e.Orderbooks = append(e.Orderbooks, ob)
}

func (e *Engine) getOrderbook(market string) *orderbook.Orderbook {
	e.orderbooksMu.RLock()
	defer e.orderbooksMu.RUnlock()
	for _, ob := range e.Orderbooks {
		if ob.Ticker() == market {
			return ob
		}
	}
	return nil
}

func (e *Engine) getBalance(userId string, asset string) string {
	e.balanceMu.RLock()
	defer e.balanceMu.RUnlock()
	ub, ok := e.Balances[userId]
	if !ok {
		return "0"
	}
	b, ok := ub[asset]
	if !ok || b == nil {
		return "0"
	}
	return strconv.FormatInt(b.Available, 10)
}

func (e *Engine) getPrice(asset string) int64 {
	return e.PriceList[asset]
}

func generateOrderId() string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 13)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

// ---------------------------------------------------------------------------
// Process — main message router (matches TS Engine.process)
// ---------------------------------------------------------------------------

func (e *Engine) Process(message types.MessageFromApi, clientId string) {
	ctx := context.Background()
	rdb := redismgr.GetInstance()

	switch message.Type {
	case types.GET_BALANCE:
		var data types.GetBalanceData
		if err := json.Unmarshal(message.Data, &data); err != nil {
			slog.Error("Error parsing GET_BALANCE:", "error", err)
			return
		}
		balance := e.getBalance(data.UserId, data.QuoteAsset)
		payload, _ := json.Marshal(types.GetBalanceMessage{UserBalance: balance})
		rdb.SendToApi(ctx, clientId, types.MessageToApi{Type: "GET_BALANCE", Data: payload})

	case types.BALANCE_UPDATE:
		var data types.BalanceUpdateData
		if err := json.Unmarshal(message.Data, &data); err != nil {
			slog.Error("Error parsing BALANCE_UPDATE:", "error", err)
			return
		}
		amountInt, err := strconv.ParseInt(data.Amount, 10, 64)
		if err == nil {
			e.balanceMu.Lock()
			userBal, exists := e.Balances[data.UserId]
			if !exists {
				userBal = make(types.UserBalance)
				e.Balances[data.UserId] = userBal
			}
			currBal, currExists := userBal[data.Currency]
			if !currExists {
				currBal = &types.Balance{Available: 0, Locked: 0}
				userBal[data.Currency] = currBal
			}
			// Update the available budget
			currBal.Available += amountInt
			e.balanceMu.Unlock()
			fmt.Printf("Dynamic balance updated for User %s, Currency %s: +%d\n", data.UserId, data.Currency, amountInt)
		} else {
			slog.Error("Error parsing BALANCE_UPDATE amount:", "error", err)
		}

	case types.GET_PRICE:
		var data types.GetPriceData
		if err := json.Unmarshal(message.Data, &data); err != nil {
			slog.Error("Error parsing GET_PRICE:", "error", err)
			return
		}
		price := e.getPrice(data.QuoteAsset)
		payload, _ := json.Marshal(types.GetPriceMessage{Price: strconv.FormatInt(price, 10)})
		rdb.SendToApi(ctx, clientId, types.MessageToApi{Type: "GET_PRICE", Data: payload})

	case types.CREATE_ORDER:
		var data types.CreateOrderData
		if err := json.Unmarshal(message.Data, &data); err != nil {
			slog.Error("Error parsing CREATE_ORDER:", "error", err)
			return
		}
		result, err := e.createOrder(data.Market, data.Price, data.TriggerPrice, data.Quantity, data.Side, data.UserId, data.Type)
		if err != nil {
			fmt.Printf("Error in order placing: %v (market=%s, price=%s, qty=%s, side=%s, userId=%s)\n", err, data.Market, data.Price, data.Quantity, data.Side, data.UserId)
			payload, _ := json.Marshal(types.OrderCancelledMessage{OrderId: "", ExecutedQty: 0, RemainingQty: 0})
			rdb.SendToApi(ctx, clientId, types.MessageToApi{Type: "ORDER_CANCELLED", Data: payload})
			return
		}
		// Post-Only orders that were rejected come back with Rejected=true and zero fills
		if result.Rejected {
			payload, _ := json.Marshal(types.OrderCancelledMessage{OrderId: result.OrderId, ExecutedQty: 0, RemainingQty: 0})
			rdb.SendToApi(ctx, clientId, types.MessageToApi{Type: "ORDER_CANCELLED", Data: payload})
			return
		}
		payload, _ := json.Marshal(types.OrderPlacedMessage{
			OrderId:     result.OrderId,
			ExecutedQty: float64(result.ExecutedQty),
			Fills:       result.Fills,
		})
		rdb.SendToApi(ctx, clientId, types.MessageToApi{Type: "ORDER_PLACED", Data: payload})

	case types.CANCEL_ORDER:
		var data types.CancelOrderData
		if err := json.Unmarshal(message.Data, &data); err != nil {
			slog.Error("Error parsing CANCEL_ORDER:", "error", err)
			return
		}
		e.cancelOrder(ctx, data.OrderId, data.Market)
		payload, _ := json.Marshal(types.OrderCancelledMessage{OrderId: data.OrderId, ExecutedQty: 0, RemainingQty: 0})
		rdb.SendToApi(ctx, clientId, types.MessageToApi{Type: "ORDER_CANCELLED", Data: payload})

	case types.GET_OPEN_ORDERS:
		var data types.GetOpenOrdersData
		if err := json.Unmarshal(message.Data, &data); err != nil {
			slog.Error("Error parsing GET_OPEN_ORDERS:", "error", err)
			return
		}
		ob := e.getOrderbook(data.Market)
		if ob == nil {
			slog.Info("No orderbook found for", "Market", data.Market)
			return
		}
		var orders []types.Order
		done := make(chan struct{})
		ob.Tasks <- func() {
			orders = ob.GetOpenOrders(data.UserId)
			close(done)
		}
		<-done

		if orders == nil {
			orders = []types.Order{}
		}
		payload, _ := json.Marshal(orders)
		rdb.SendToApi(ctx, clientId, types.MessageToApi{Type: "OPEN_ORDERS", Data: payload})

	case types.ON_RAMP:
		var data types.OnRampData
		if err := json.Unmarshal(message.Data, &data); err != nil {
			slog.Error("Error parsing ON_RAMP:", "error", err)
			return
		}
		amount, _ := strconv.ParseInt(data.Amount, 10, 64)
		e.onRamp(data.UserId, amount)

	case types.GET_DEPTH:
		var data types.GetDepthData
		if err := json.Unmarshal(message.Data, &data); err != nil {
			slog.Error("Error parsing GET_DEPTH:", "error", err)
			return
		}
		ob := e.getOrderbook(data.Market)
		if ob == nil {
			payload, _ := json.Marshal(types.DepthMessage{Bids: [][2]string{}, Asks: [][2]string{}})
			rdb.SendToApi(ctx, clientId, types.MessageToApi{Type: "DEPTH", Data: payload})
			return
		}
		var depth types.DepthMessage
		done := make(chan struct{})
		ob.Tasks <- func() {
			depth = ob.GetDepth()
			close(done)
		}
		<-done
		payload, _ := json.Marshal(depth)
		rdb.SendToApi(ctx, clientId, types.MessageToApi{Type: "DEPTH", Data: payload})
	}
}

// ---------------------------------------------------------------------------
// Order creation result
// ---------------------------------------------------------------------------

type createOrderResult struct {
	ExecutedQty int64
	Fills       []types.Fill
	OrderId     string
	Rejected    bool
}

// ---------------------------------------------------------------------------
// createOrder — matches TS Engine.createOrder
// ---------------------------------------------------------------------------

func (e *Engine) createOrder(market, priceStr, triggerPriceStr, quantityStr, side, userId, orderType string) (*createOrderResult, error) {
	ob := e.getOrderbook(market)
	if ob == nil {
		return nil, types.ErrInvalidMarket
	}

	baseAsset := strings.Split(market, "_")[0]
	quoteAsset := strings.Split(market, "_")[1]

	price, _ := strconv.ParseInt(priceStr, 10, 64)
	triggerPrice, _ := strconv.ParseInt(triggerPriceStr, 10, 64)
	quantity, _ := strconv.ParseInt(quantityStr, 10, 64)

	// For market orders, we don't enforce a specific price boundary — we lock based on
	// a conservative estimation of the best available price from the orderbook.
	effectivePrice := price
	if types.OrderType(orderType) == types.OrderTypeMarket {
		if side == "buy" && len(ob.Asks) > 0 {
			// For market buys, lock funds at worst-ask price (top ask if sorted ascending)
			effectivePrice = ob.Asks[0].Price
		} else if side == "sell" {
			// For market sells, base asset is what we give away; price doesn't matter for lock
			effectivePrice = 0
		}
	}

	if err := e.checkAndLockFunds(baseAsset, quoteAsset, side, userId, effectivePrice, quantity); err != nil {
		slog.Error("createOrder failed at checkAndLockFunds", "error", err)
		return nil, err
	}

	order := types.Order{
		Type:         types.OrderType(orderType),
		Price:        price,
		TriggerPrice: triggerPrice,
		Quantity:     quantity,
		OrderID:      generateOrderId(),
		Side:         types.Side(side),
		UserID:       userId,
	}

	ch := make(chan *createOrderResult)
	ob.Tasks <- func() {
		result := ob.AddOrder(order)
		fills := result.Fills
		executedQty := result.ExecutedQty

		ctx := context.Background()

		// If the order was rejected (e.g. Post-Only would have crossed the spread), skip persistence
		if !result.Rejected {
			e.updateBalance(userId, baseAsset, quoteAsset, side, fills)
			e.createDbTrades(ctx, fills, market, userId, side == "buy")
			e.updateDbOrders(ctx, result, executedQty, fills, market)
			e.publishWsDepthUpdates(ctx, fills, priceStr, side, market)
			if len(fills) > 0 {
				lastPrice := strconv.FormatInt(fills[len(fills)-1].Price, 10)
				e.publishWsPriceUpdates(ctx, market, lastPrice)
			}
			e.publishWsTrades(ctx, fills, userId, market)
		}

		ch <- &createOrderResult{
			ExecutedQty: executedQty,
			Fills:       fills,
			OrderId:     result.OrderID,
			Rejected:    result.Rejected,
		}
	}

	return <-ch, nil
}

// ---------------------------------------------------------------------------
// cancelOrder — matches TS Engine (inside CANCEL_ORDER case)
// ---------------------------------------------------------------------------

func (e *Engine) cancelOrder(ctx context.Context, orderId string, market string) {
	ob := e.getOrderbook(market)
	if ob == nil {
		slog.Info("No orderbook found for", "Market", market)
		return
	}

	parts := strings.Split(market, "_")
	if len(parts) != 2 {
		slog.Info("Invalid market format:", "Market", market)
		return
	}
	baseAsset := parts[0]
	quoteAsset := parts[1]

	done := make(chan struct{})
	ob.Tasks <- func() {
		defer close(done)

		// Try to find the order in asks or bids.
		var order *types.Order
		for i := range ob.Asks {
			if ob.Asks[i].OrderID == orderId {
				order = &ob.Asks[i]
				break
			}
		}
		if order == nil {
			for i := range ob.Bids {
				if ob.Bids[i].OrderID == orderId {
					order = &ob.Bids[i]
					break
				}
			}
		}
		if order == nil {
			slog.Info("No order found:", "OrderID", orderId)
			return
		}

		if order.Side == types.SideBuy {
			price, found := ob.CancelBid(orderId)
			leftQuantity := ((order.Quantity - order.ExecutedQty) * order.Price) / ScalingFactor

			e.balanceMu.Lock()
			e.ensureBalance(order.UserID, quoteAsset)
			e.Balances[order.UserID][quoteAsset].Available += leftQuantity
			e.Balances[order.UserID][quoteAsset].Locked -= leftQuantity
			e.balanceMu.Unlock()

			if found {
				e.sendUpdatedDepthAt(ctx, strconv.FormatInt(price, 10), market)
			}
		} else {
			price, found := ob.CancelAsk(orderId)
			leftQuantity := order.Quantity - order.ExecutedQty

			e.balanceMu.Lock()
			e.ensureBalance(order.UserID, baseAsset)
			e.Balances[order.UserID][baseAsset].Available += leftQuantity
			e.Balances[order.UserID][baseAsset].Locked -= leftQuantity
			e.balanceMu.Unlock()

			if found {
				e.sendUpdatedDepthAt(ctx, strconv.FormatInt(price, 10), market)
			}
		}
	}
	<-done
}

// ---------------------------------------------------------------------------
// Balance management
// ---------------------------------------------------------------------------

func (e *Engine) ensureBalance(userId string, asset string) {
	// Must be called with e.balanceMu held (Lock)
	if _, ok := e.Balances[userId]; !ok {
		e.Balances[userId] = make(types.UserBalance)
	}
	if e.Balances[userId][asset] == nil {
		e.Balances[userId][asset] = &types.Balance{}
	}
}

func (e *Engine) onRamp(userId string, amount int64) {
	e.balanceMu.Lock()
	defer e.balanceMu.Unlock()
	e.ensureBalance(userId, BaseCurrency)
	e.Balances[userId][BaseCurrency].Available += amount
}

func (e *Engine) checkAndLockFunds(baseAsset, quoteAsset, side string, userId string, price, quantity int64) error {
	e.balanceMu.Lock()
	defer e.balanceMu.Unlock()
	totalPrice := quantity * price
	if side == "buy" {
		e.ensureBalance(userId, quoteAsset)
		if e.Balances[userId][quoteAsset].Available < totalPrice/ScalingFactor {
			slog.Error("checkAndLockFunds: Buy failed - user %s has %d %s available, needs %d\n", userId, e.Balances[userId][quoteAsset].Available, quoteAsset, totalPrice/ScalingFactor)
			return types.ErrInsufficientFunds
		}
		e.Balances[userId][quoteAsset].Available -= totalPrice / ScalingFactor
		e.Balances[userId][quoteAsset].Locked += totalPrice / ScalingFactor
	} else {
		e.ensureBalance(userId, baseAsset)
		if e.Balances[userId][baseAsset].Available < quantity {
			fmt.Printf("checkAndLockFunds: Sell failed - user %s has %d %s available, needs %d\n", userId, e.Balances[userId][baseAsset].Available, baseAsset, quantity)
			return types.ErrInsufficientFunds
		}
		e.Balances[userId][baseAsset].Available -= quantity
		e.Balances[userId][baseAsset].Locked += quantity
	}
	return nil
}

func (e *Engine) updateBalance(userId, baseAsset, quoteAsset, side string, fills []types.Fill) {
	e.balanceMu.Lock()
	defer e.balanceMu.Unlock()
	if side == "buy" {
		for _, fill := range fills {
			totalValue := (fill.Quantity * fill.Price) / ScalingFactor
			// Seller gets quote currency
			e.ensureBalance(fill.OtherUserId, quoteAsset)
			e.Balances[fill.OtherUserId][quoteAsset].Available += totalValue
			// Buyer's locked quote currency decreases
			e.ensureBalance(userId, quoteAsset)
			e.Balances[userId][quoteAsset].Locked -= totalValue
			// Seller's locked base asset decreases
			e.ensureBalance(fill.OtherUserId, baseAsset)
			e.Balances[fill.OtherUserId][baseAsset].Locked -= fill.Quantity
			// Buyer gets base asset
			e.ensureBalance(userId, baseAsset)
			e.Balances[userId][baseAsset].Available += fill.Quantity
		}
	} else {
		for _, fill := range fills {
			totalValue := (fill.Quantity * fill.Price) / ScalingFactor
			// Buyer's locked quote decreases
			e.ensureBalance(fill.OtherUserId, quoteAsset)
			e.Balances[fill.OtherUserId][quoteAsset].Locked -= totalValue
			// Seller gets quote
			e.ensureBalance(userId, quoteAsset)
			e.Balances[userId][quoteAsset].Available += totalValue
			// Buyer gets base
			e.ensureBalance(fill.OtherUserId, baseAsset)
			e.Balances[fill.OtherUserId][baseAsset].Available += fill.Quantity
			// Seller's locked base decreases
			e.ensureBalance(userId, baseAsset)
			e.Balances[userId][baseAsset].Locked -= fill.Quantity
		}
	}
}

// ---------------------------------------------------------------------------
// Redis DB pushes — matches TS createDbTrades, updateDbOrders
// ---------------------------------------------------------------------------

func (e *Engine) createDbTrades(ctx context.Context, fills []types.Fill, market, userId string, isTakerBuy bool) {
	rdb := redismgr.GetInstance()
	for _, fill := range fills {
		buyerId, sellerId := userId, fill.OtherUserId
		if !isTakerBuy {
			buyerId, sellerId = fill.OtherUserId, userId
		}
		data, _ := json.Marshal(types.TradeAddedData{
			Market:        market,
			ID:            strconv.FormatInt(fill.TradeId, 10),
			IsBuyerMaker:  fill.OtherUserId == userId,
			Price:         strconv.FormatInt(fill.Price, 10),
			Quantity:      strconv.FormatInt(fill.Quantity, 10),
			QuoteQuantity: strconv.FormatInt((fill.Quantity*fill.Price)/ScalingFactor, 10),
			Timestamp:     time.Now().UnixMilli(),
			BuyerId:       buyerId,
			SellerId:      sellerId,
		})
		rdb.PushMessage(ctx, types.DbMessage{Type: types.TRADE_ADDED, Data: data})
	}
}

func (e *Engine) updateDbOrders(ctx context.Context, order types.Order, executedQty int64, fills []types.Fill, market string) {
	rdb := redismgr.GetInstance()

	// Push the taker order update.
	data, _ := json.Marshal(types.OrderUpdateData{
		OrderId:     order.OrderID,
		ExecutedQty: executedQty,
		Market:      market,
		Price:       strconv.FormatInt(order.Price, 10),
		Quantity:    strconv.FormatInt(order.Quantity, 10),
		Side:        string(order.Side),
		UserId:      order.UserID,
	})
	rdb.PushMessage(ctx, types.DbMessage{Type: types.ORDER_UPDATE, Data: data})

	// Push each maker (resting) order update with full metadata so DB can UPSERT.
	for _, fill := range fills {
		// Determine the resting order's side: if the taker was a buy, maker was a sell and vice versa
		makerSide := "sell"
		if order.Side == types.SideSell {
			makerSide = "buy"
		}
		fdata, _ := json.Marshal(types.OrderUpdateData{
			OrderId:     fill.MarketOrderId,
			ExecutedQty: fill.Quantity,
			Market:      market,
			Price:       strconv.FormatInt(fill.Price, 10),
			Quantity:    strconv.FormatInt(fill.Quantity, 10),
			Side:        makerSide,
			UserId:      fill.OtherUserId,
		})
		rdb.PushMessage(ctx, types.DbMessage{Type: types.ORDER_UPDATE, Data: fdata})
	}
}

// ---------------------------------------------------------------------------
// WebSocket publishing — matches TS publishWsTrades, publishWsDepthUpdates,
// publishWsPriceUpdates, sendUpdatedDepthAt
// ---------------------------------------------------------------------------

func (e *Engine) publishWsTrades(ctx context.Context, fills []types.Fill, userId, market string) {
	rdb := redismgr.GetInstance()
	channel := fmt.Sprintf("trade@%s", market)
	for _, fill := range fills {
		data, _ := json.Marshal(map[string]interface{}{
			"e": "trade",
			"t": fill.TradeId,
			"m": fill.OtherUserId == userId,
			"p": strconv.FormatInt(fill.Price, 10),
			"q": strconv.FormatInt(fill.Quantity, 10),
			"s": market,
		})
		rdb.PublishMessage(ctx, channel, types.WsMessage{Stream: channel, Data: data})
	}
}

func (e *Engine) publishWsDepthUpdates(ctx context.Context, fills []types.Fill, priceStr, side, market string) {
	ob := e.getOrderbook(market)
	if ob == nil {
		return
	}
	depth := ob.GetDepth()
	channel := fmt.Sprintf("depth@%s", market)
	rdb := redismgr.GetInstance()

	if side == "buy" {
		// Updated asks: for each fill price, find current depth or "0"
		updatedAsks := make([][2]string, 0, len(fills))
		for _, f := range fills {
			p := strconv.FormatInt(f.Price, 10)
			qty := "0"
			for _, a := range depth.Asks {
				if a[0] == p {
					qty = a[1]
					break
				}
			}
			updatedAsks = append(updatedAsks, [2]string{p, qty})
		}
		// Updated bid at the order price
		var updatedBids [][2]string
		for _, b := range depth.Bids {
			if b[0] == priceStr {
				updatedBids = append(updatedBids, b)
				break
			}
		}
		data, _ := json.Marshal(map[string]interface{}{
			"a": updatedAsks,
			"b": updatedBids,
			"e": "depth",
		})
		rdb.PublishMessage(ctx, channel, types.WsMessage{Stream: channel, Data: data})
	} else {
		// Updated bids: for each fill price, find current depth or "0"
		updatedBids := make([][2]string, 0, len(fills))
		for _, f := range fills {
			p := strconv.FormatInt(f.Price, 10)
			qty := "0"
			for _, b := range depth.Bids {
				if b[0] == p {
					qty = b[1]
					break
				}
			}
			updatedBids = append(updatedBids, [2]string{p, qty})
		}
		// Updated ask at the order price
		var updatedAsks [][2]string
		for _, a := range depth.Asks {
			if a[0] == priceStr {
				updatedAsks = append(updatedAsks, a)
				break
			}
		}
		data, _ := json.Marshal(map[string]interface{}{
			"a": updatedAsks,
			"b": updatedBids,
			"e": "depth",
		})
		rdb.PublishMessage(ctx, channel, types.WsMessage{Stream: channel, Data: data})
	}
}

func (e *Engine) sendUpdatedDepthAt(ctx context.Context, priceStr, market string) {
	ob := e.getOrderbook(market)
	if ob == nil {
		return
	}
	depth := ob.GetDepth()
	channel := fmt.Sprintf("depth@%s", market)
	rdb := redismgr.GetInstance()

	var updatedBids [][2]string
	for _, b := range depth.Bids {
		if b[0] == priceStr {
			updatedBids = append(updatedBids, b)
		}
	}
	var updatedAsks [][2]string
	for _, a := range depth.Asks {
		if a[0] == priceStr {
			updatedAsks = append(updatedAsks, a)
		}
	}

	if len(updatedAsks) == 0 {
		updatedAsks = [][2]string{{priceStr, "0"}}
	}
	if len(updatedBids) == 0 {
		updatedBids = [][2]string{{priceStr, "0"}}
	}

	data, _ := json.Marshal(map[string]interface{}{
		"a": updatedAsks,
		"b": updatedBids,
		"e": "depth",
	})
	rdb.PublishMessage(ctx, channel, types.WsMessage{Stream: channel, Data: data})
}

func (e *Engine) publishWsPriceUpdates(ctx context.Context, market, price string) {
	channel := fmt.Sprintf("ticker@%s", market)
	rdb := redismgr.GetInstance()
	data, _ := json.Marshal(map[string]interface{}{
		"e": "ticker",
		"c": price,
		"s": market,
	})
	rdb.PublishMessage(ctx, channel, types.WsMessage{Stream: channel, Data: data})
}
