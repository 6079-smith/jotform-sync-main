import './globals.css';

export const metadata = {
  title: 'Jotform Sync',
  description: 'Jotform Sync Application',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-gray-900 text-gray-100">
        {children}
      </body>
    </html>
  );
}
