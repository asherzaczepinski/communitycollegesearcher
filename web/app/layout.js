import './globals.css';

export const metadata = {
  title: 'CA Community College Course Searcher',
  description: 'Search transferable courses across every California community college — by subject, transfer area, format, and more.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
