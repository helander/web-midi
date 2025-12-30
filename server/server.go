/***********************************************************************************************

   Server used for implementing web based user interfaces towards MIDI devices.
    - Supports sending midi to device via pipewire.
    - Server caches state and sends state to midi device when device is connected/reconnected.
    - Initial state read from a device specific json file.

***********************************************************************************************/

package main

/*
#cgo pkg-config: libpipewire-0.3
#include <stdlib.h>
#include "pw.h"
*/
import "C"

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"unsafe"
)

// Cache for "channel:cc" -> value
var (
	ccCache = make(map[string]uint8)
	cacheMu sync.RWMutex
)

// PipeWire state channel
var stateCh = make(chan struct{}, 1)

func main() {

	// ---- Command line flags ----
	nodeName := flag.String("node", "", "PipeWire node name (required)")
	httpPort := flag.Int("port", 8080, "HTTP server port")
	deviceDir := flag.String("device", "../device/example", "Path to device files (./init.json, ./web/index.html, ...")

	flag.Parse()

	if *nodeName == "" {
		fmt.Fprintln(os.Stderr, "Error: -node is required")
		flag.Usage()
		os.Exit(1)
	}

	// ---- PipeWire init ----
	cNode := C.CString(*nodeName)
	defer C.free(unsafe.Pointer(cNode))

	// Load initial values to cache
	if err := loadInitialValues(*deviceDir + "/init.json"); err != nil {
		log.Fatalf("Failed to load initial values: %v", err)
	}

	// Start PipeWire client node
	C.pw_start(cNode)

	// Serve web files
	webDir := *deviceDir + "/web"
	fs := http.FileServer(http.Dir(webDir))
	http.Handle("/", fs)

	// HTTP endpoints
	http.HandleFunc("/set", handleSetCC)
	http.HandleFunc("/get", handleGetCC)

	addr := fmt.Sprintf(":%d", *httpPort)
	log.Printf(
		"HTTP server on %s (PipeWire node=%q, webdir=%q)",
		addr,
		*nodeName,
		webDir,
	)
	log.Fatal(http.ListenAndServe(addr, nil))

}

//
// ---------- Initial state of cache  ----------
//

func loadInitialValues(filename string) error {
	data, err := os.ReadFile(filename)
	if err != nil {
		return err
	}

	var initial map[string]uint8
	if err := json.Unmarshal(data, &initial); err != nil {
		return err
	}

	for key, value := range initial {
		if _, _, err := parseKey(key); err != nil {
			log.Printf("Invalid key %q in JSON, skipping", key)
			continue
		}

		cacheMu.Lock()
		ccCache[key] = value
		cacheMu.Unlock()
	}

	log.Printf("Loaded %d CC values into cache", len(initial))
	return nil
}

//
// ---------- Cache → MIDI ----------
//

// Iterate over current cache and send all CC values
func sendAllCachedCC() {
	cacheMu.RLock()
	defer cacheMu.RUnlock()

	for key, value := range ccCache {
		channel, cc, err := parseKey(key)
		if err != nil {
			log.Printf("Invalid cache key %q, skipping", key)
			continue
		}
		sendCC(channel, cc, value)
	}
}

//
// ---------- Helpers ----------
//

func parseKey(key string) (uint8, uint8, error) {
	parts := strings.Split(key, ":")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid key format")
	}

	ch, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, 0, err
	}
	cc, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, 0, err
	}

	return uint8(ch), uint8(cc), nil
}

func sendCC(channel, cc, value uint8) {
	status := 0xB0 | channel
	C.pw_send_midi(3,
		C.uint8_t(status),
		C.uint8_t(cc),
		C.uint8_t(value),
	)
}

//
// ---------- HTTP handlers ----------
//

func handleSetCC(w http.ResponseWriter, r *http.Request) {
	channelStr := r.URL.Query().Get("channel")
	ccStr := r.URL.Query().Get("cc")
	valueStr := r.URL.Query().Get("value")

	channel64, err := strconv.ParseUint(channelStr, 10, 8)
	if err != nil {
		http.Error(w, "invalid channel", http.StatusBadRequest)
		return
	}
	cc64, err := strconv.ParseUint(ccStr, 10, 8)
	if err != nil {
		http.Error(w, "invalid cc", http.StatusBadRequest)
		return
	}
	value64, err := strconv.ParseUint(valueStr, 10, 8)
	if err != nil {
		http.Error(w, "invalid value", http.StatusBadRequest)
		return
	}

	channel := uint8(channel64)
	cc := uint8(cc64)
	value := uint8(value64)

	key := fmt.Sprintf("%d:%d", channel, cc)

	cacheMu.Lock()
	ccCache[key] = value
	cacheMu.Unlock()

	sendCC(channel, cc, value)

	w.Write([]byte("CC value updated\n"))
}

func handleGetCC(w http.ResponseWriter, r *http.Request) {
	channelStr := r.URL.Query().Get("channel")
	ccStr := r.URL.Query().Get("cc")

	channel64, err := strconv.ParseUint(channelStr, 10, 8)
	if err != nil {
		http.Error(w, "invalid channel", http.StatusBadRequest)
		return
	}
	cc64, err := strconv.ParseUint(ccStr, 10, 8)
	if err != nil {
		http.Error(w, "invalid cc", http.StatusBadRequest)
		return
	}

	channel := uint8(channel64)
	cc := uint8(cc64)

	key := fmt.Sprintf("%d:%d", channel, cc)

	cacheMu.Lock()
	value := ccCache[key]
	cacheMu.Unlock()

	w.Write([]byte(fmt.Sprintf("%d",value)))
}

/*
func handleGetState(w http.ResponseWriter, r *http.Request) {
	cacheMu.RLock()
	defer cacheMu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ccCache)
}
*/

//
// ---------- PipeWire callbacks ----------
//

//export go_state_streaming
func go_state_streaming() {
	select {
	case stateCh <- struct{}{}:
	default:
	}
}

func init() {
	go func() {
		for range stateCh {
			log.Println("PipeWire state ready → sending cached CC state")
			sendAllCachedCC()
		}
	}()
}
