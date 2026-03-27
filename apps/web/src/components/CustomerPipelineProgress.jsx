'use client';

export default function CustomerPipelineProgress({
    completed = 0,
    total = 5,
    compact = false,
}) {
    const safeTotal = Math.max(0, Number(total || 0));
    const safeCompleted = Math.min(safeTotal, Math.max(0, Number(completed || 0)));

    if (safeTotal <= 0) {
        return null;
    }

    return (
        <div className={`pipeline-progress ${compact ? 'is-compact' : ''}`}>
            <div className="pipeline-progress-bar" aria-hidden="true">
                {Array.from({ length: safeTotal }, (_, index) => (
                    <span
                        key={index}
                        className={`pipeline-progress-segment ${index < safeCompleted ? 'is-filled' : ''}`}
                    />
                ))}
            </div>
            <span className="pipeline-progress-copy">{safeCompleted}/{safeTotal}</span>
        </div>
    );
}
