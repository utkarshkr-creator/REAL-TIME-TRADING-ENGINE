package orderbook

import (
	"fmt"
	"testing"

	"exchangeManager/internal/types"
)

func makeOrder(id, userID string, side types.Side, price, qty int64, t types.OrderType) types.Order {
	return types.Order{
		OrderID:  id,
		UserID:   userID,
		Side:     side,
		Price:    price,
		Quantity: qty,
		Type:     t,
	}
}

func newBenchOrderbook() *Orderbook {
	return &Orderbook{
		bidLevels:    make(map[int64]*priceLevel),
		askLevels:    make(map[int64]*priceLevel),
		bidHeap:      make(bidPriceHeap, 0),
		askHeap:      make(askPriceHeap, 0),
		orderPrice:   make(map[string]int64),
		orderSide:    make(map[string]types.Side),
		cancelled:    make(map[string]struct{}),
		StopBids:     make([]types.Order, 0),
		StopAsks:     make([]types.Order, 0),
		BaseAsset:    "TATA",
		QuoteAsset:   "INR",
		LastTradeId:  0,
		CurrentPrice: 100_000_000,
		Tasks:        make(chan func(), 1000),
	}
}

func seedBook(ob *Orderbook, n int) {
	base := int64(100_000_000)
	for i := 0; i < n; i++ {
		ob.AddOrder(makeOrder(fmt.Sprintf("ask-seed-%d", i), "maker", types.SideSell, base+int64(i+1)*1_000_000, 1_000_000, types.OrderTypeLimit))
		ob.AddOrder(makeOrder(fmt.Sprintf("bid-seed-%d", i), "maker", types.SideBuy, base-int64(i+1)*1_000_000, 1_000_000, types.OrderTypeLimit))
	}
}

// BenchmarkLimitOrderNoMatch inserts a non-matching bid then cancels it
// to keep book size constant across iterations.
func BenchmarkLimitOrderNoMatch(b *testing.B) {
	ob := newBenchOrderbook()
	seedBook(ob, 500)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		id := fmt.Sprintf("o-%d", i)
		ob.AddOrder(makeOrder(id, "user1", types.SideBuy, 50_000_000, 1_000_000, types.OrderTypeLimit))
		ob.CancelBid(id) // undo to keep book size stable
	}
}

// BenchmarkLimitOrderWithMatch matches then replenishes to keep book size stable.
func BenchmarkLimitOrderWithMatch(b *testing.B) {
	ob := newBenchOrderbook()
	seedBook(ob, 500)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ob.AddOrder(makeOrder(fmt.Sprintf("taker-%d", i), "taker", types.SideBuy, 110_000_000, 100_000, types.OrderTypeLimit))
		ob.AddOrder(makeOrder(fmt.Sprintf("replenish-%d", i), "maker", types.SideSell, 101_000_000, 100_000, types.OrderTypeLimit))
	}
}

// BenchmarkMarketOrder sweeps then refills to keep book size stable.
func BenchmarkMarketOrder(b *testing.B) {
	ob := newBenchOrderbook()
	seedBook(ob, 1000)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ob.AddOrder(makeOrder(fmt.Sprintf("mkt-%d", i), "taker", types.SideBuy, 0, 50_000, types.OrderTypeMarket))
		ob.AddOrder(makeOrder(fmt.Sprintf("refill-%d", i), "maker", types.SideSell, 101_000_000, 50_000, types.OrderTypeLimit))
	}
}

// BenchmarkCancelOrder measures insert+cancel on a fixed-size book.
func BenchmarkCancelOrder(b *testing.B) {
	ob := newBenchOrderbook()
	seedBook(ob, 500)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		id := fmt.Sprintf("cancel-me-%d", i)
		ob.AddOrder(makeOrder(id, "user1", types.SideBuy, 50_000_000, 1_000_000, types.OrderTypeLimit))
		ob.CancelBid(id)
	}
}

// BenchmarkThroughput alternates buy/sell that match seeded liquidity.
func BenchmarkThroughput(b *testing.B) {
	ob := newBenchOrderbook()
	seedBook(ob, 200)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if i%2 == 0 {
			ob.AddOrder(makeOrder(fmt.Sprintf("buy-%d", i), "taker", types.SideBuy, 105_000_000, 10_000, types.OrderTypeLimit))
		} else {
			ob.AddOrder(makeOrder(fmt.Sprintf("sell-%d", i), "taker", types.SideSell, 95_000_000, 10_000, types.OrderTypeLimit))
		}
	}
}
