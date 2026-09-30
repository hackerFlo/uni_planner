import agentDot from '../../assets/agent-dot.png';
import agentRing from '../../assets/agent-ring.svg';

export default function AgentActivityIcon({ variant = 'fuzzy' }) {
  if (variant === 'robot') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="w-3.5 h-3.5">
        <path d="M6 6.5h8v6.2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6.5Z" fill="currentColor" opacity=".22" />
        <path d="M10 3.5v2M6 7h8v5.7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7ZM4 9v3m12-3v3M8 9.5h.01M12 9.5h.01M8.5 12h3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 16h4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <img
      src={variant === 'ring' ? agentRing : agentDot}
      alt=""
      aria-hidden="true"
      width="20"
      height="20"
      className={variant === 'ring' ? 'w-full h-full object-contain brightness-75 dark:brightness-100' : 'w-full h-full object-contain'}
    />
  );
}
