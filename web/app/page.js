import Searcher from './Searcher';

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="inner">
          <div className="logo">CC<span>Finder</span></div>
          <div className="tag">Search transferable courses across every California community college</div>
        </div>
      </header>
      <main className="wrap">
        <Searcher />
      </main>
    </>
  );
}
