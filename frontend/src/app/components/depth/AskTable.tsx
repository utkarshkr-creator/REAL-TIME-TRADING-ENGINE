export const AskTable = ({ asks }: { asks: [string, string][] }) => {
  let currentTotal = 0;
  const relevantAsks = (asks ?? []).slice(0, 15);
  relevantAsks.reverse();
  const asksWithTotal: [string, string, number][] = relevantAsks.map(
    ([price, quantity]) => [price, quantity, (currentTotal += Number(quantity))]
  );
  const maxTotal = relevantAsks.reduce(
    (acc, [_, quantity]) => acc + Number(quantity),
    0
  );
  asksWithTotal.reverse();
  
  return (
    <div>
      {asksWithTotal.map(([price, quantity, total]) => (
        <Ask
          maxTotal={maxTotal}
          key={price}
          price={price}
          quantity={quantity}
          total={total}
        />
      ))}
    </div>
  );
};

function Ask({
  price,
  quantity,
  total,
  maxTotal,
}: {
  price: string;
  quantity: string;
  total: number;
  maxTotal: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "100%",
        backgroundColor: "transparent",
        overflow: "hidden",
      }}
      className="hover:bg-slate-800/30 cursor-pointer"
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: `${(100 * total) / maxTotal}%`,
          height: "100%",
          background: "linear-gradient(to left, rgba(228, 75, 68, 0.25), rgba(228, 75, 68, 0.05))",
          transition: "width 0.3s ease-in-out",
        }}
      ></div>
      <div className="flex justify-between text-xs w-full px-3 py-1 relative z-10">
        <div className="text-red-500">{Number(price).toFixed(2)}</div>
        <div className="text-slate-300">{Number(quantity).toFixed(4)}</div>
        <div className="text-slate-500">{total.toFixed(4)}</div>
      </div>
    </div>
  );
}
