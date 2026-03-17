import {
    ColorType,
    createChart as createLightWeightChart,
    CrosshairMode,
    ISeriesApi,
    UTCTimestamp,
} from "lightweight-charts";

export class ChartManager {
    private candleSeries: ISeriesApi<"Candlestick">;
    private volumeSeries: ISeriesApi<"Histogram">;
    private ma20Series: ISeriesApi<"Line">;
    private recentCloses: number[] = [];
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
                vertLine: {
                    width: 1,
                    color: 'rgba(255, 255, 255, 0.4)',
                    style: 1, // Dotted
                },
                horzLine: {
                    width: 1,
                    color: 'rgba(255, 255, 255, 0.4)',
                    style: 1, // Dotted
                },
            },
            rightPriceScale: {
                visible: true,
                ticksVisible: true,
                entireTextOnly: true,
                borderVisible: false,
                autoScale: true,
            },
            grid: {
                horzLines: {
                    color: "rgba(255, 255, 255, 0.03)",
                    visible: true,
                },
                vertLines: {
                    color: "rgba(255, 255, 255, 0.03)",
                    visible: true,
                },
            },
            layout: {
                background: {
                    type: ColorType.Solid,
                    color: "#0B0E14", // Deeper, more premium crypto dark background
                },
                textColor: "rgba(255, 255, 255, 0.7)",
                fontSize: 12,
                fontFamily: "'Inter', sans-serif"
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: true,
                borderVisible: false,
            }
        });
        this.chart = chart;
        this.candleSeries = chart.addCandlestickSeries({
            upColor: '#2ebd85',      // Binance-style green
            downColor: '#f6465d',    // Binance-style red
            borderVisible: false,
            wickUpColor: '#2ebd85',
            wickDownColor: '#f6465d',
            priceLineVisible: false,
        });

        this.volumeSeries = chart.addHistogramSeries({
            color: '#2ebd85',
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: '', // Set as an overlay
        });
        
        chart.priceScale('').applyOptions({
            scaleMargins: {
                top: 0.8, // Push volume to the bottom 20% of the chart
                bottom: 0,
            },
        });

        this.ma20Series = chart.addLineSeries({
            color: '#f6c343', // Binance-style yellow for MA
            lineWidth: 2,
            crosshairMarkerVisible: false,
            priceLineVisible: false,
        });

        this.candleSeries.setData(
            initialData.map((data) => ({
                ...data,
                time: (data?.timestamp / 1000) as UTCTimestamp,
            }))
        );
        
        this.volumeSeries.setData(
            initialData.map((data) => ({
                time: (data?.timestamp / 1000) as UTCTimestamp,
                value: data.volume ? parseFloat(data.volume) : 0,
                color: (data.close >= data.open) ? 'rgba(46, 189, 133, 0.5)' : 'rgba(246, 70, 93, 0.5)',
            }))
        );

        // Calculate and set MA20
        const ma20Data: any[] = [];
        for (let i = 0; i < initialData.length; i++) {
            if (i >= 19) {
                let sum = 0;
                for (let j = 0; j < 20; j++) {
                    sum += initialData[i - j].close;
                }
                ma20Data.push({
                    time: (initialData[i].timestamp / 1000) as UTCTimestamp,
                    value: sum / 20,
                });
            }
        }
        this.ma20Series.setData(ma20Data);
        this.recentCloses = initialData.map(d => d.close).slice(-20);

        // Apply Zooming: show only the last ~100 candles by default instead of squishing thousands
        const totalBars = initialData.length;
        if (totalBars > 100) {
            chart.timeScale().setVisibleLogicalRange({
                from: totalBars - 100,
                to: totalBars,
            });
        }
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

        this.volumeSeries.update({
            time: (this.lastUpdateTime / 1000) as UTCTimestamp,
            value: updatedPrice.volume ? parseFloat(updatedPrice.volume) : 0,
            color: (updatedPrice.close >= updatedPrice.open) ? 'rgba(46, 189, 133, 0.5)' : 'rgba(246, 70, 93, 0.5)',
        });

        // Update MA20 dynamically
        if (updatedPrice.newCandleInitiated) {
            this.recentCloses.push(updatedPrice.close);
            if (this.recentCloses.length > 20) {
                this.recentCloses.shift();
            }
            this.lastUpdateTime = updatedPrice.time;
        } else {
            // Update the current unclosed candle's close
            this.recentCloses[this.recentCloses.length - 1] = updatedPrice.close;
        }

        if (this.recentCloses.length === 20) {
            const sum = this.recentCloses.reduce((a, b) => a + b, 0);
            this.ma20Series.update({
                time: (this.lastUpdateTime / 1000) as UTCTimestamp,
                value: sum / 20,
            });
        }
    }
    public resize(width: number, height: number) {
        this.chart.resize(width, height);
    }
    public destroy() {
        this.chart.remove();
    }
}