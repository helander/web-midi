#include "pw.h"

#include <pipewire/pipewire.h>
#include <spa/utils/ringbuffer.h>
#include <spa/param/format-utils.h>
#include <spa/pod/builder.h>
#include <string.h>
#include <stdio.h>


#include <spa/control/control.h>
#include <spa/control/ump-utils.h> // for UMP helpers



/* ---------------- data ---------------- */

#define RB_CAPACITY 1024

struct midi_msg {
    uint8_t size;
    uint8_t data[3];
};

static struct spa_ringbuffer rb;
static uint8_t rb_data[RB_CAPACITY * sizeof(struct midi_msg)];


struct port {
};

struct port *port;


static struct pw_thread_loop *loop;
static struct pw_filter *filter;

/* ---------------- RT PROCESS ---------------- */


static void on_process(void *data, struct spa_io_position *pos)
{
struct pw_buffer *pwbuf = pw_filter_dequeue_buffer(port);
if (!pwbuf)
    return;



struct spa_buffer *sbuf = pwbuf->buffer;
struct spa_data *d = &sbuf->datas[0];

struct spa_pod_builder b = SPA_POD_BUILDER_INIT(d->data, d->maxsize);
struct spa_pod_frame seq;

spa_pod_builder_push_sequence(&b, &seq, 0);


uint32_t count = 0;
struct midi_msg msg;
uint32_t read_index, write_index;

spa_ringbuffer_get_read_index(&rb, &read_index);
spa_ringbuffer_get_write_index(&rb, &write_index);

while (write_index - read_index >= sizeof(msg)) {
    spa_ringbuffer_read_data(&rb, rb_data, sizeof(rb_data), read_index % sizeof(rb_data), &msg, sizeof(msg));
    spa_ringbuffer_read_update(&rb, read_index + sizeof(msg));
    read_index += sizeof(msg);

     uint32_t umpdata = (0x2 << 28) | (0x0 << 24) | (msg.data[0] << 16) | (msg.data[1] << 8) | msg.data[2];
     spa_pod_builder_control(&b, 0, SPA_CONTROL_UMP);
     spa_pod_builder_int(&b, umpdata);

}


spa_pod_builder_pop(&b, &seq);

d->chunk->offset = 0;
d->chunk->size   = b.state.offset;
d->chunk->stride = 0;


    pw_filter_queue_buffer(port, pwbuf);


}


extern void go_state_streaming();

static void on_state_changed(void *data, enum pw_filter_state old, enum pw_filter_state state, const char *error) {
   if (state == PW_FILTER_STATE_STREAMING) go_state_streaming();
}


static const struct pw_filter_events filter_events = {
	PW_VERSION_FILTER_EVENTS,
	.process = on_process,
	.state_changed = on_state_changed,
};

/* ---------------- CONTROL (Go interface) ---------------- */

/*
void pw_send_midi(uint8_t size, uint8_t b0, uint8_t b1, uint8_t b2)
{
    printf("\npw_send_midi");fflush(stdout);
    struct midi_msg msg = { .size = size, .data = {b0, b1, b2} };

    pw_thread_loop_lock(loop);
    uint32_t index;
    uint32_t qqq = spa_ringbuffer_get_write_index(&rb, &index);
    printf("\npw_send_midi  index %d   qqq %d",index,qqq);fflush(stdout);

    if (spa_ringbuffer_get_write_index(&rb, &index) >= sizeof(msg)) {


        spa_ringbuffer_write_data(
            &rb,
            rb_data,
            sizeof(rb_data),
            index,
            &msg,
            sizeof(msg)
        );
        spa_ringbuffer_write_update(&rb, index + sizeof(msg));
        printf("\npw_send_midi index %d",index);fflush(stdout);
    }
    pw_thread_loop_unlock(loop);
}
*/

void pw_send_midi(uint8_t size, uint8_t b0, uint8_t b1, uint8_t b2)
{
    struct midi_msg msg = { .size = size, .data = {b0, b1, b2} };

    pw_thread_loop_lock(loop);

    uint32_t write_index, read_index;
    spa_ringbuffer_get_write_index(&rb, &write_index);
    spa_ringbuffer_get_read_index(&rb, &read_index);

    uint32_t used = write_index - read_index;
    uint32_t free_space = sizeof(rb_data) - used;

    if (free_space >= sizeof(msg)) {
        spa_ringbuffer_write_data(
            &rb,
            rb_data,
            sizeof(rb_data),
            write_index % sizeof(rb_data), // handle wrap-around
            &msg,
            sizeof(msg)
        );
        spa_ringbuffer_write_update(&rb, write_index + sizeof(msg));
    } else {
        // Ringbuffer full: drop message or log warning
        // Example: fprintf(stderr, "MIDI ringbuffer full, dropping message\n");
    }

    pw_thread_loop_unlock(loop);
}
/* ---------------- INIT / SHUTDOWN ---------------- */

void pw_start(char *node_name)
{
    pw_init(NULL, NULL);
    spa_ringbuffer_init(&rb);

    loop = pw_thread_loop_new("go-pw-loop", NULL);
    pw_thread_loop_start(loop);

    pw_thread_loop_lock(loop);


/////////////////////////////////////

	filter = pw_filter_new_simple(
			pw_thread_loop_get_loop(loop),
			node_name,
			pw_properties_new(
				PW_KEY_MEDIA_TYPE, "Midi",
				PW_KEY_MEDIA_CATEGORY, "Playback",
				PW_KEY_MEDIA_CLASS, "Midi/Source",
				NULL),
			&filter_events,
			NULL);

	/* Make a midi output port */
	port = pw_filter_add_port(filter,
			PW_DIRECTION_OUTPUT,
			PW_FILTER_PORT_FLAG_MAP_BUFFERS,
			sizeof(struct port),
			pw_properties_new(
				PW_KEY_FORMAT_DSP, "32 bit raw UMP",
				PW_KEY_PORT_NAME, "output",
				NULL),
			NULL, 0);


	uint8_t buffer[1024];
	struct spa_pod_builder builder;
	struct spa_pod *params[1];
	uint32_t n_params = 0;


	spa_pod_builder_init(&builder, buffer, sizeof(buffer));

	params[n_params++] = spa_pod_builder_add_object(&builder,
			/* POD Object for the buffer parameter */
			SPA_TYPE_OBJECT_ParamBuffers, SPA_PARAM_Buffers,
			/* Default 1 buffer, minimum of 1, max of 32 buffers.
			 * We can do with 1 buffer as we dequeue and queue in the same
			 * cycle.
			 */
			SPA_PARAM_BUFFERS_buffers, SPA_POD_CHOICE_RANGE_Int(8, 8, 32),
			/* MIDI buffers always have 1 data block */
			SPA_PARAM_BUFFERS_blocks,  SPA_POD_Int(1),
			/* Buffer size: request default 4096 bytes, min 4096, no maximum */
			SPA_PARAM_BUFFERS_size,    SPA_POD_CHOICE_RANGE_Int(4096, 4096, INT32_MAX),
			/* MIDI buffers have stride 1 */
			SPA_PARAM_BUFFERS_stride,  SPA_POD_Int(1));

	pw_filter_update_params(filter, port,
			(const struct spa_pod **)params, n_params);





	/* Now connect this filter. We ask that our process function is
	 * called in a realtime thread. */
	if (pw_filter_connect(filter,
				PW_FILTER_FLAG_RT_PROCESS,
				NULL, 0) < 0) {
		fprintf(stderr, "can't connect\n");
		return;
	}


/////////////////////////////////////



    pw_thread_loop_unlock(loop);
}

void pw_stop(void)
{
    pw_thread_loop_lock(loop);
    pw_filter_disconnect(filter);
    pw_filter_destroy(filter);
    pw_thread_loop_unlock(loop);

    pw_thread_loop_stop(loop);
    pw_thread_loop_destroy(loop);
    pw_deinit();
}

