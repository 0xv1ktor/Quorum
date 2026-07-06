import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getConfig,
  readTopic,
  readPosts,
  readStats,
  submitPost,
  applyWalletAccount,
} from './genlayer.js';
import { connectWallet, hasWallet, onAccountsChanged } from './wallet.js';

const DELIB_STEPS = [
  'Opening validator session',
  'Reading the submission',
  'Checking the board policy',
  'Comparing validator decisions',
  'Writing the result on-chain',
];

function short(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—';
}

function initials(value = '') {
  const clean = value.replace(/^0x/i, '').trim();
  return clean ? clean.slice(0, 2).toUpperCase() : 'Q';
}

function verdictLabel(post) {
  if (post.approved) return 'Approved';
  const labels = {
    toxic: 'Toxic',
    'off-topic': 'Off-topic',
    spam: 'Spam',
    other: 'Rejected',
  };
  return labels[post.category] ?? 'Rejected';
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [topic, setTopic] = useState('');
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState({ total: 0, approved: 0 });
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [step, setStep] = useState(0);
  const [clock, setClock] = useState(0);
  const [wallet, setWallet] = useState(null);
  const [walletErr, setWalletErr] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [navNotice, setNavNotice] = useState(false);
  const timer = useRef(null);
  const noticeTimer = useRef(null);

  useEffect(() => {
    try {
      setConfig(getConfig());
    } catch (err) {
      setConfigError(err.message);
    }
  }, []);

  useEffect(() => {
    return onAccountsChanged((addr) => {
      if (addr) {
        applyWalletAccount(addr, window.ethereum);
        setWallet(addr);
      } else {
        setWallet(null);
      }
      setConfig(getConfig());
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoadingFeed(true);
    try {
      const nextTopic = await readTopic();
      const nextPosts = await readPosts();
      const nextStats = await readStats();
      setTopic(nextTopic);
      setPosts(nextPosts);
      setStats(nextStats);
    } catch (err) {
      setStatus({ kind: 'error', text: `Could not read the chain: ${err.message}` });
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  useEffect(() => {
    if (config && !configError) refresh();
  }, [config, configError, refresh]);

  useEffect(() => {
    if (submitting) {
      const startedAt = Date.now();
      timer.current = setInterval(() => {
        setClock(Math.floor((Date.now() - startedAt) / 1000));
        setStep((i) => (i + 1) % DELIB_STEPS.length);
      }, 1000);
    } else if (timer.current) {
      clearInterval(timer.current);
      setStep(0);
      setClock(0);
    }
    return () => timer.current && clearInterval(timer.current);
  }, [submitting]);

  useEffect(() => {
    return () => noticeTimer.current && clearTimeout(noticeTimer.current);
  }, []);

  function showComingSoon(e) {
    e.preventDefault();
    setNavNotice(true);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNavNotice(false), 2200);
  }

  async function onConnect() {
    setWalletErr(null);
    setConnecting(true);
    try {
      const { address, provider } = await connectWallet();
      applyWalletAccount(address, provider);
      setWallet(address);
      setConfig(getConfig());
    } catch (err) {
      setWalletErr(err.message);
    } finally {
      setConnecting(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setSubmitting(true);
    setStatus({ kind: 'pending' });
    try {
      await submitPost(value);
      setText('');
      await refresh();
      const newest = (await readPosts())[0];
      if (newest) setStatus({ kind: newest.approved ? 'pass' : 'fail', verdict: newest });
    } catch (err) {
      setStatus({ kind: 'error', text: `Quorum failed: ${err.message}` });
    } finally {
      setSubmitting(false);
    }
  }

  if (configError) {
    return (
      <main className="app-shell error-shell">
        <section className="notice-card">
          <span className="kicker">Setup required</span>
          <h1>Quorum cannot start yet.</h1>
          <p>{configError}</p>
        </section>
      </main>
    );
  }

  const rejected = Math.max(stats.total - stats.approved, 0);
  const rate = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;
  const mm = String(Math.floor(clock / 60)).padStart(2, '0');
  const ss = String(clock % 60).padStart(2, '0');
  return (
    <div className="app-shell">
      <Header
        wallet={wallet}
        connecting={connecting}
        onConnect={onConnect}
        network={config?.network}
        onComingSoon={showComingSoon}
      />

      {walletErr && <div className="toast">{walletErr}</div>}
      {navNotice && <div className="toast toast-info">Coming soon</div>}

      <main className="page">
        <section className="hero-panel">
          <div>
            <span className="kicker">Live on GenLayer</span>
            <h1>{topic || 'Quorum Board'}</h1>
            <p>Post to a public board where validator consensus decides what enters the record.</p>
          </div>
          <a href="#composer" className="primary-button">Create post</a>
        </section>

        <section className="content-grid">
          <div className="main-column">
            <Composer
              text={text}
              setText={setText}
              onSubmit={onSubmit}
              submitting={submitting}
              topic={topic}
              status={status}
              step={DELIB_STEPS[step]}
              mm={mm}
              ss={ss}
              wallet={wallet}
            />

            <div className="section-head">
              <div>
                <h2>Discussions & Articles</h2>
                <p>Live posts settled by validator consensus</p>
              </div>
              <button className="quiet-button" onClick={refresh} disabled={loadingFeed}>
                {loadingFeed ? 'Refreshing' : 'Refresh'}
              </button>
            </div>

            <StatsStrip total={stats.total} approved={stats.approved} rejected={rejected} rate={rate} />

            <Feed loading={loadingFeed} posts={posts} />
          </div>

          <aside className="side-column">
            <CommunityCard
              topic={topic}
              contractAddress={config?.contractAddress}
              network={config?.network}
              total={stats.total}
            />
          </aside>
        </section>
      </main>
    </div>
  );
}

function Header({ wallet, connecting, onConnect, network, onComingSoon }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">Q</span>
        <span>Quorum</span>
      </div>
      <nav className="nav-links" aria-label="Primary">
        <a href="#feed" onClick={onComingSoon}>Feed</a>
        <a href="#composer" onClick={onComingSoon}>Post</a>
        <a href="#community" onClick={onComingSoon}>Community</a>
      </nav>
      <div className="top-actions">
        <span className="network-pill">{network ?? 'Bradbury'}</span>
        <WalletButton wallet={wallet} connecting={connecting} onConnect={onConnect} />
      </div>
    </header>
  );
}

function WalletButton({ wallet, connecting, onConnect }) {
  if (wallet) {
    return (
      <span className="avatar wallet-avatar" title={wallet}>
        {initials(wallet)}
      </span>
    );
  }
  return (
    <button onClick={onConnect} disabled={connecting} className="primary-button">
      {connecting ? 'Linking' : hasWallet() ? 'Connect' : 'Wallet'}
    </button>
  );
}

function Composer({ text, setText, onSubmit, submitting, topic, status, step, mm, ss, wallet }) {
  return (
    <form id="composer" className="composer" onSubmit={onSubmit}>
      <div className="composer-top">
        <div className="avatar">{wallet ? initials(wallet) : 'Q'}</div>
        <div>
          <h1>Create New Post</h1>
          <p>{topic || 'Loading board topic...'}</p>
        </div>
        <span className="char-count">{text.length}/2000</span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        rows={4}
        disabled={submitting}
        placeholder="Share a thoughtful post with the community..."
      />

      <div className="composer-actions">
        <div className="policy-note">
          <span /> Validator consensus may take a few minutes.
        </div>
        <button className="primary-button" disabled={submitting || !text.trim()} type="submit">
          {submitting ? 'Publishing' : 'Publish'}
        </button>
      </div>

      {status?.kind === 'pending' && <Progress step={step} mm={mm} ss={ss} />}
      {status?.kind === 'error' && <p className="status error">{status.text}</p>}
      {status?.verdict && <Result post={status.verdict} />}
    </form>
  );
}

function Progress({ step, mm, ss }) {
  return (
    <div className="progress-card">
      <div>
        <strong>{step}</strong>
        <span>Validator consensus in progress</span>
      </div>
      <time>{mm}:{ss}</time>
    </div>
  );
}

function Result({ post }) {
  return (
    <div className={'status result ' + (post.approved ? 'approved' : 'rejected')}>
      <strong>{post.approved ? 'Post approved' : 'Post rejected'}</strong>
      {post.reason && <span>{post.reason}</span>}
    </div>
  );
}

function StatsStrip({ total, approved, rejected, rate }) {
  return (
    <div className="stats-strip">
      <Metric label="Posts" value={total} />
      <Metric label="Approved" value={approved} />
      <Metric label="Rejected" value={rejected} />
      <Metric label="Pass rate" value={`${rate}%`} />
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Feed({ loading, posts }) {
  if (loading && posts.length === 0) {
    return (
      <div id="feed" className="feed-list">
        {[0, 1, 2].map((item) => (
          <div className="feed-row skeleton-row" key={item}>
            <span className="avatar skeleton" />
            <div>
              <span className="skeleton line" />
              <span className="skeleton line short" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div id="feed" className="empty-state">
        <h3>No posts yet</h3>
        <p>Publish the first thread for this Quorum board.</p>
      </div>
    );
  }

  return (
    <ol id="feed" className="feed-list">
      {posts.map((post) => (
        <FeedItem key={post.index} post={post} />
      ))}
    </ol>
  );
}

function FeedItem({ post }) {
  return (
    <li className="feed-row">
      <span className="avatar">{initials(post.author)}</span>
      <div className="feed-body">
        <div className="feed-title-line">
          <h3>{post.text}</h3>
          <span className={'verdict-pill ' + (post.approved ? 'approved' : 'rejected')}>
            {verdictLabel(post)}
          </span>
        </div>
        <p>
          {short(post.author)} · post #{post.index + 1}
          {post.reason ? ` · ${post.reason}` : ''}
        </p>
      </div>
    </li>
  );
}

function CommunityCard({ topic, contractAddress, network, total }) {
  return (
    <section id="community" className="panel">
      <span className="kicker">Community</span>
      <h2>{topic || 'Quorum Board'}</h2>
      <p>Public conversation moderated by validator consensus on GenLayer.</p>
      <div className="community-meta">
        <span>{total} on-chain posts</span>
        <span>{network ?? 'testnet-bradbury'}</span>
      </div>
      <a href="https://explorer-bradbury.genlayer.com/" target="_blank" rel="noreferrer">
        {short(contractAddress)} on Bradbury
      </a>
    </section>
  );
}
