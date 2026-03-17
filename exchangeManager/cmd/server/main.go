package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"

	"exchangeManager/internal/engine"
	"exchangeManager/internal/types"

	"github.com/redis/go-redis/v9"
)

type ApiMessageWrapper struct {
	Message  types.MessageFromApi `json:"message"`
	ClientId string               `json:"clientId"`
}

func main() {
	//Logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	// 1. Initialize Engine
	exchangeEngine, err := engine.NewEngine()
	if err != nil {
		slog.Error("Failed to initialize engine", "error", err)
	}

	// 2. Initialize Redis Client
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}

	client := redis.NewClient(&redis.Options{
		Addr: redisAddr,
	})
	defer client.Close()

	ctx := context.Background()
	if err := client.Ping(ctx).Err(); err != nil {
		slog.Error("Failed to connect to Redis", "addr", redisAddr, "error", err)
	}
	slog.Info("Connected to Redis", "redis_addr", redisAddr, "service", "redis")

	slog.Info("Exchange Engine started. Listening for messages...", "service", "engine")
	// 3. Infinite loop to consume messages from the API
	for {
		// BRPop blocks indefinitely until a message is available in the "messages" list
		result, err := client.BRPop(ctx, 0, "messages").Result()
		if err != nil {
			slog.Error("Error popping message from Redis", "error", err)
			continue
		}

		// Result is a slice: [listName, element]
		if len(result) < 2 {
			continue
		}

		msgData := result[1]

		// 4. Parse the message wrapper
		var wrapper ApiMessageWrapper
		if err := json.Unmarshal([]byte(msgData), &wrapper); err != nil {
			slog.Error("Failed to unmarshal message", "error", err, "msg", msgData)
			continue
		}

		// 5. Spawn a goroutine to process the message concurrently
		// The engine's Orderbook channels and Mutexes handle the concurrency safely.
		go exchangeEngine.Process(wrapper.Message, wrapper.ClientId)
	}
}
