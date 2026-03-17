import {
    ColorType,
    createChart as createLightWeightChart,
    CrosshairMode,
    ISeriesApi,
    UTCTimestamp,
} from "lightweight-charts";

export class ChartManager {
    private candleSeries: ISeriesApi<"Candlestick">;
    private lastUpdateTime: number = 0;
    private chart: any;
    private currentBar: {
        open: number | null;
        high: number | null;
        low: number | null;
        close: number | null;
    } = {
            open: null,
            high: null,
            low: null,
            close: null,
        };

    constructor(
        ref: any,
        initialData: any[],
        layout: { background: string; color: string }
    ) {
        const chart = createLightWeightChart(ref, {
            width: ref.clientWidth,
            height: ref.clientHeight,
            overlayPriceScales: {
                ticksVisible: true,
                borderVisible: true,
            },
            crosshair: {
                mode: CrosshairMode.Normal,
            },
            rightPriceScale: {
                visible: true,
                ticksVisible: true,
                entireTextOnly: true,
            },
            grid: {
                horzLines: {
                    color: "rgba(255, 255, 255, 0.05)",
                    visible: true,
                },
                vertLines: {
                    color: "rgba(255, 255, 255, 0.05)",
                    visible: true,
                },
            },
            layout: {
                background: {
                    type: ColorType.Solid,
                    color: "#0B0E14", // Deeper, more premium crypto dark background
                },
                textColor: "rgba(255, 255, 255, 0.7)",
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: true,
            }
        });
        this.chart = chart;
        this.candleSeries = chart.addCandlestickSeries({
            upColor: '#2ebd85',      // Binance-style green
            downColor: '#f6465d',    // Binance-style red
            borderVisible: false,
            wickUpColor: '#2ebd85',
            wickDownColor: '#f6465d',
        });
        // console.log("initialData", initialData);
        this.candleSeries.setData(
            initialData.map((data) => ({
                ...data,
                time: (data?.timestamp / 1000) as UTCTimestamp,
            }))
        );
    }
    public update(updatedPrice: any) {
        if (!this.lastUpdateTime) {
            this.lastUpdateTime = new Date().getTime();
        }

        this.candleSeries.update({
            time: (this.lastUpdateTime / 1000) as UTCTimestamp,
            close: updatedPrice.close,
            low: updatedPrice.low,
            high: updatedPrice.high,
            open: updatedPrice.open,
        });

        if (updatedPrice.newCandleInitiated) {
            this.lastUpdateTime = updatedPrice.time;
        }
    }
    public resize(width: number, height: number) {
        this.chart.resize(width, height);
    }
    public destroy() {
        this.chart.remove();
    }
}