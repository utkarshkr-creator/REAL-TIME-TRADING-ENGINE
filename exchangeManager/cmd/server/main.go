package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
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
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		panic("REDIS_URL environment variable is required")
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		slog.Error("Failed to parse REDIS_URL", "error", err)
		panic(err)
	}

	client := redis.NewClient(opts)
	defer client.Close()

	ctx := context.Background()
	if err := client.Ping(ctx).Err(); err != nil {
		slog.Error("Failed to connect to Redis", "url", redisURL, "error", err)
	}
	slog.Info("Connected to Redis", "redis_url", redisURL, "service", "redis")

	slog.Info("Exchange Engine started. Listening for messages...", "service", "engine")

	// Start a dummy HTTP server to satisfy Render's Web Service port binding requirement
	port := os.Getenv("PORT")
	if port == "" {
		slog.Error("PORT environment variable is required")
		os.Exit(1)
	}
	go func() {
		http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("Engine is healthy"))
		})
		slog.Info("Starting dummy health check server", "port", port)
		if err := http.ListenAndServe(":"+port, nil); err != nil {
			slog.Error("Health check server failed", "error", err)
		}
	}()

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
