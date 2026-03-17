package types

type Side string

const (
	SideBuy  Side = "buy"
	SideSell Side = "sell"
)

type OrderType string

const (
	OrderTypeLimit      OrderType = "limit"
	OrderTypeMarket     OrderType = "market"
	OrderTypeIOC        OrderType = "ioc"
	OrderTypePostOnly   OrderType = "post_only"
	OrderTypeStopLimit  OrderType = "stop_limit"
	OrderTypeStopMarket OrderType = "stop_market"
)

type Order struct {
	Type         OrderType `json:"type"`
	Price        int64     `json:"price"`
	TriggerPrice int64     `json:"triggerPrice"`
	Quantity     int64     `json:"quantity"`
	OrderID      string    `json:"orderId"`
	Side         Side      `json:"side"`
	UserID       string    `json:"userId"`
	Fills        []Fill    `json:"fills"`
	ExecutedQty  int64     `json:"executedQty"`
	Rejected     bool      `json:"rejected"`
}

type Fill struct {
	Price         int64  `json:"price"`
	Quantity      int64  `json:"qty"`
	TradeId       int64  `json:"tradeId"`
	OtherUserId   string `json:"otherUserId"`
	MarketOrderId string `json:"marketOrderId"`
}

type UserBalance map[string]*Balance

type Balance struct {
	Available int64
	Locked    int64
}

type OrderbookSnapshot struct {
	BaseAsset    string
	QuoteAsset   string
	Bids         []Order
	Asks         []Order
	LastTradeId  int64
	CurrentPrice int64
}

const BaseCurrency = "INR"
