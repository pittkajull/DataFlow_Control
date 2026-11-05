function StatIcon({ type }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  if (type === 'total') {
    return (
      <svg {...common}>
        <path d="m12 3 8 4-8 4-8-4 8-4Z" />
        <path d="m4 12 8 4 8-4M4 17l8 4 8-4" />
      </svg>
    );
  }

  if (type === 'active') {
    return (
      <svg {...common}>
        <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />
      </svg>
    );
  }

  if (type === 'success') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.6 2.6L16.5 9" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M10.3 4.2 2.6 17.5A1.8 1.8 0 0 0 4.2 20h15.6a1.8 1.8 0 0 0 1.6-2.5L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 16.5h.01" />
    </svg>
  );
}

export default function StatCards({ workflows, executions }) {
  const recent = executions.slice(0, 20);
  const total = workflows.length;
  const active = workflows.filter((workflow) => workflow.active).length;
  const success = recent.filter((execution) => execution.status === 'success').length;
  const failed = recent.filter((execution) =>
    ['error', 'crashed'].includes(execution.status),
  ).length;

  const cards = [
    {
      key: 'total',
      label: 'Total workflow',
      value: total,
      caption: total ? `${active} workflow sedang aktif` : 'Belum ada workflow',
      tone: 'neutral',
      icon: 'total',
    },
    {
      key: 'active',
      label: 'Workflow aktif',
      value: active,
      caption: `Dari ${total} workflow terdaftar`,
      tone: 'lime',
      icon: 'active',
    },
    {
      key: 'success',
      label: 'Sukses',
      value: success,
      caption: `Dari ${recent.length} eksekusi terakhir`,
      tone: 'green',
      icon: 'success',
    },
    {
      key: 'failed',
      label: 'Gagal',
      value: failed,
      caption: 'Status error dan crashed',
      tone: 'red',
      icon: 'failed',
    },
  ];

  return (
    <div className="stats-grid">
      {cards.map((card, index) => (
        <article
          className="stat-card"
          data-tone={card.tone}
          key={card.key}
          style={{ animationDelay: `${index * 70}ms` }}
        >
          <div className="stat-top">
            <span className="stat-label">{card.label}</span>
            <span className="stat-icon">
              <StatIcon type={card.icon} />
            </span>
          </div>
          <strong className="stat-value">{card.value}</strong>
          <p className="stat-caption">{card.caption}</p>
        </article>
      ))}
    </div>
  );
}
