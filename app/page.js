import { loadAllSubmissions } from './actions';
import SubmissionsContainer from './components/SubmissionsContainer';

export default async function Home() {
  // Load all submissions regardless of status
  const { submissions, statusCounts, timestamp, lastFetchedTimestamp, error } = await loadAllSubmissions(); // Retrieve all submissions
  
  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-8">
      <div className="w-full max-w-7xl">
        {/* Client component that handles data refresh */}
        <SubmissionsContainer 
          initialSubmissions={submissions}
          initialStatusCounts={statusCounts}
          initialTimestamp={timestamp}
          initialLastFetchedTimestamp={lastFetchedTimestamp}
          initialError={error}
        />
      </div>
    </main>
  )
}
