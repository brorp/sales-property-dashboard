/**
 * Reusable button. Maps variant/size props to global .btn-* classes.
 *
 * variant: 'primary' | 'danger-soft' | 'secondary' | 'success' | 'danger' | 'ghost'
 * size:    'sm' | 'md' (default) | 'lg'
 * loading: shows a spinner and disables the button
 * loadingText: text shown while loading (falls back to children)
 * leftIcon / rightIcon: icon nodes rendered beside the label
 */
export default function Button({
    variant = 'primary',
    size,
    loading = false,
    loadingText,
    leftIcon,
    rightIcon,
    children,
    className = '',
    disabled,
    type = 'button',
    ...props
}) {
    const cls = [
        'btn',
        `btn-${variant}`,
        size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '',
        className,
    ].filter(Boolean).join(' ');

    return (
        <button type={type} className={cls} disabled={disabled || loading} {...props}>
            {loading && <span className="btn-spinner" aria-hidden="true" />}
            {!loading && leftIcon ? leftIcon : null}
            {loading && loadingText ? loadingText : children}
            {!loading && rightIcon ? rightIcon : null}
        </button>
    );
}
