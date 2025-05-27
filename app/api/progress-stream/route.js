
// In-memory store for progress data
// In a production app, you might use Redis or another mechanism 
// that supports multiple instances
const progressStore = {
  specificationProgress: null
};

// Function to update progress data
export function updateProgress(type, data) {
  if (type === 'specification-progress') {
    progressStore.specificationProgress = data;
  }
}

// Server-sent events handler
export async function GET() {
  // Set headers for SSE
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  };

  // Create a readable stream
  const stream = new ReadableStream({
    start(controller) {
      // Function to send progress updates
      const sendProgress = () => {
        // Send specification progress if available
        if (progressStore.specificationProgress) {
          const data = JSON.stringify({
            type: 'specification-progress',
            progress: progressStore.specificationProgress
          });
          controller.enqueue(`data: ${data}\n\n`);
        }
      };

      // Send initial data
      sendProgress();

      // Set up interval to send updates
      const intervalId = setInterval(sendProgress, 1000);

      // Clean up function
      return () => {
        clearInterval(intervalId);
      };
    },
  });

  return new Response(stream, { headers });
}

// Export the progress store for use in server actions
export { progressStore };
