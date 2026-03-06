import express from "express";
import cors from "cors";
import { depthRouter } from "./routes/depth";
import { orderRouter } from "./routes/order";
import { tradesRouter } from "./routes/trades";
import { klineRouter } from "./routes/Kline";
import { tickerRouter } from "./routes/ticker";
import { authRouter } from "./routes/auth";

const app = express();
app.use(cors());

app.use(express.json());
app.use("/api/v1/depth", depthRouter);
app.use("/api/v1/order", orderRouter);
app.use("/api/v1/trades", tradesRouter);
app.use("/api/v1/klines", klineRouter);
app.use("/api/v1/tickers", tickerRouter);
app.use("/api/v1/auth", authRouter);


app.listen(3006, () => {
  console.log("Server is listing of port 3006");
})
