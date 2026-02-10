import { NextResponse } from 'next/server';
import { processingEvents, ProgressUpdate } from '@/lib/tcm-admin/processor';
import { getActiveJobs, getPendingCheckpoints, ensureAdminTables } from '@/lib/tcm-admin';

// GET /api/tcm/admin/status/stream - SSE endpoint for real-time updates
export async function GET() {
  ensureAdminTables();

  const encoder = new TextEncoder();
  let isConnected = true;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state
      const sendInitialState = () => {
        try {
          const activeJobs = getActiveJobs();
          const pendingCheckpoints = getPendingCheckpoints();

          const data = JSON.stringify({
            type: 'init',
            activeJobs,
            pendingCheckpoints,
            timestamp: new Date().toISOString()
          });

          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch (error) {
          console.error('Error sending initial state:', error);
        }
      };

      // Handler for progress events
      const progressHandler = (update: ProgressUpdate) => {
        if (!isConnected) return;

        try {
          const data = JSON.stringify({
            type: 'progress',
            ...update,
            timestamp: new Date().toISOString()
          });

          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch (error) {
          console.error('Error sending progress update:', error);
        }
      };

      // Send initial state
      sendInitialState();

      // Subscribe to progress events
      processingEvents.on('progress', progressHandler);

      // Heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        if (!isConnected) {
          clearInterval(heartbeat);
          return;
        }

        try {
          const activeJobs = getActiveJobs();
          const pendingCheckpoints = getPendingCheckpoints();

          const data = JSON.stringify({
            type: 'heartbeat',
            counts: {
              active: activeJobs.length,
              pending: pendingCheckpoints.length
            },
            timestamp: new Date().toISOString()
          });

          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Connection may be closed
        }
      }, 30000);

      // Cleanup on close
      return () => {
        isConnected = false;
        clearInterval(heartbeat);
        processingEvents.off('progress', progressHandler);
      };
    },

    cancel() {
      isConnected = false;
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
