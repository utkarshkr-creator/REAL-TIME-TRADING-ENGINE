import axios from 'axios';
import { Ticker, Depth, Trade, KLine } from './types'
const BASE_URL = "http://localhost:3006/api/v1";

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
  return response.data.data;
}

export async function getDepth(market: string): Promise<Depth> {
  const response = await axios.get(`${BASE_URL}/depth?symbol=${market}`);
  return response.data;
}

export async function getTrades(market: string): Promise<Trade[]> {
  const response = await axios.get(`${BASE_URL}/trades?symbol=${market}`);
  return response.data.data;
}

export async function getKlines(market: string, interval: string, startTime: number, endTime: number): Promise<KLine[]> {
  const response = await axios.get(`${BASE_URL}/klines?symbol=${market}&interval=${interval}&startTime=${startTime}&endTime=${endTime}`);
  const data: KLine[] = response.data;
  return data.sort((x, y) => (Number(x.end) < Number(y.end) ? -1 : 1));
}

export async function getBalance(userId:string,quoteAsset:string) {
  const response=await axios.get(`${BASE_URL}/depth/balance?userId=${userId}&quoteAsset=${quoteAsset}`);
  const data=response.data.userBalance;
  return data;
}