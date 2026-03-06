import axios from 'axios';
import { Ticker, Depth, Trade, KLine } from './types'
const BASE_URL = "http://localhost:3006/api/v1";

const DECIMAL_PRECISION = parseInt(process.env.NEXT_PUBLIC_DECIMAL_PRECISION || '6', 10);
const SCALING_FACTOR = Math.pow(10, DECIMAL_PRECISION);

export async function getTicker(market: string): Promise<Ticker> {
  const tickers: Ticker[] = await getTickers();
  const ticker = tickers.find(t => t.symbol.toString() === market);
  if (!ticker) {
    throw new Error(`No ticker found for ${market}`);
  }
  return ticker;
}

export async function getTickers(): Promise<Ticker[]> {
  const response = await axios.get(`${BASE_URL}/tickers`);
  return response.data.data.map((t: any) => ({
    ...t,
    lastPrice: (Number(t.lastPrice) / SCALING_FACTOR).toString(),
    high: (Number(t.high) / SCALING_FACTOR).toString(),
    low: (Number(t.low) / SCALING_FACTOR).toString(),
    volume: (Number(t.volume) / SCALING_FACTOR).toString(),
    quoteVolume: (Number(t.quoteVolume) / SCALING_FACTOR).toString()
  }));
}

export async function getDepth(market: string): Promise<Depth> {
  const response = await axios.get(`${BASE_URL}/depth?symbol=${market}`);
  return {
    ...response.data,
    bids: response.data.bids?.map(([price, qty]: [string, string]) => [(Number(price) / SCALING_FACTOR).toString(), (Number(qty) / SCALING_FACTOR).toString()]),
    asks: response.data.asks?.map(([price, qty]: [string, string]) => [(Number(price) / SCALING_FACTOR).toString(), (Number(qty) / SCALING_FACTOR).toString()])
  };
}

export async function getTrades(market: string): Promise<Trade[]> {
  const response = await axios.get(`${BASE_URL}/trades?symbol=${market}`);
  return response.data.map((t: Trade) => ({
    ...t,
    price: (Number(t.price) / SCALING_FACTOR).toString(),
    quantity: (Number(t.quantity) / SCALING_FACTOR).toString()
  }));
}

export async function getKlines(market: string, interval: string, startTime: number, endTime: number): Promise<KLine[]> {
  const response = await axios.get(`${BASE_URL}/klines?symbol=${market}&interval=${interval}&startTime=${startTime}&endTime=${endTime}`);
  const data: KLine[] = response.data;
  if (!Array.isArray(data)) return [];
  return data.sort((x, y) => (new Date(x.end).getTime() < new Date(y.end).getTime() ? -1 : 1)).map((k: KLine) => ({
    ...k,
    close: (Number(k.close) / SCALING_FACTOR).toString(),
    high: (Number(k.high) / SCALING_FACTOR).toString(),
    low: (Number(k.low) / SCALING_FACTOR).toString(),
    open: (Number(k.open) / SCALING_FACTOR).toString(),
    volume: (Number(k.volume) / SCALING_FACTOR).toString(),
    quoteVolume: (Number(k.quoteVolume) / SCALING_FACTOR).toString(),
  }));
}

export async function getBalance(userId: string, quoteAsset: string) {
  const response = await axios.get(`${BASE_URL}/depth/balance?userId=${userId}&quoteAsset=${quoteAsset}`);
  const data = response.data.userBalance;
  return Number(data);
}

export async function getPrice(userId: string, quoteAsset: string) {
  const response = await axios.get(`${BASE_URL}/depth/price?quoteAsset=${quoteAsset}`);
  const data = response.data.price;
  return Number(data);
}