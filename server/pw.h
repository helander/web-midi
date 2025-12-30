#pragma once
#include <stdint.h>

void pw_start(char *node_name);
void pw_stop(void);

/* enqueue a short MIDI message (1–3 bytes) */
void pw_send_midi(uint8_t size, uint8_t b0, uint8_t b1, uint8_t b2);
