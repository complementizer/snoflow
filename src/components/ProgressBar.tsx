interface ProgressBarProps {
  reviewed: number;
  total: number;
}

export function ProgressBar({ reviewed, total }: ProgressBarProps) {
  const percentage = total > 0 ? (reviewed / total) * 100 : 0;
  const isComplete = reviewed === total && total > 0;

  return (
    <div className="flex items-center gap-3">
      <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${isComplete ? 'bg-emerald-500' : 'bg-blue-500'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={`text-sm font-medium ${isComplete ? 'text-emerald-600' : 'text-slate-600'}`}>
        {reviewed}/{total}
        {isComplete && ' ✓'}
      </span>
    </div>
  );
}
