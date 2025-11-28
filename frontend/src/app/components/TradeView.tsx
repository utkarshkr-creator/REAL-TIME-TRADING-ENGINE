import { useEffect, useRef, useState } from "react";
import { ChartManager } from "../utils/ChartManager";
import { getKlines } from "../utils/httpClient";
import { KLine } from "../utils/types";
import { SignalingManager } from "../utils/SignalingManager";

export function TradeView({ market }: { market: string }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartManagerRef = useRef<ChartManager>(null);
  const [interval, setInterval] = useState("1m");

  useEffect(() => {
    const init = async () => {
      let klineData: KLine[] = [];
      try {
        klineData = await getKlines(
          market,
          interval,
          Math.floor((new Date().getTime() - 1000 * 60 * 60 * 24 * 7) / 1000),
          Math.floor(new Date().getTime() / 1000)
        );
      } catch (e) {}

      if (chartRef) {
        if (chartManagerRef.current) {
          chartManagerRef.current.destroy();
        }
        const chartManager = new ChartManager(
          chartRef.current,
          [
            ...klineData?.map((x) => ({
              close: parseFloat(x.close),
              high: parseFloat(x.high),
              low: parseFloat(x.low),
              open: parseFloat(x.open),
              timestamp: new Date(x.end),
            })),

          ].sort((x, y) => (x.timestamp < y.timestamp ? -1 : 1))
            .filter((item, index, self) =>
              index === self.findIndex((t) => (
                t.timestamp.getTime() === item.timestamp.getTime()
              ))
            ) || [],
          {
            background: "#0e0f14",
            color: "white",
          }
        );
        //@ts-ignore
        chartManagerRef.current = chartManager;
      }
    };
    init();

    SignalingManager.getInstance().registerCallback(
      `trade@${market}`,
      (data: any) => {
        chartManagerRef.current?.update(data);
      },
      `TRADE-${market}`
    );

    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || !entries[0].target) return;
      const { width, height } = entries[0].contentRect;
      chartManagerRef.current?.resize(width, height);
    });

    if (chartRef.current) {
      resizeObserver.observe(chartRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      SignalingManager.getInstance().deRegisterCallback(
        `trade@${market}`,
        `TRADE-${market}`
      );
    };
  }, [market, chartRef, interval]);

  return (
    <div className="flex flex-col flex-1 bg-baseBackgroundL1 w-full h-full">
      <div className="flex flex-row items-center justify-between px-4 py-3 border-b border-baseBorder">
        <div className="flex items-center gap-1">
          {["1m", "1h", "1d"].map((int) => (
            <button
              key={int}
              onClick={() => setInterval(int)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                interval === int
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              {int}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={chartRef}
        className="w-full flex-1 relative overflow-hidden min-h-0"
      ></div>
    </div>
  );
}
