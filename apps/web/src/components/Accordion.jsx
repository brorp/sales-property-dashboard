import { useState, useRef, useEffect } from 'react';
import './Accordion.css';

export default function Accordion({ title, summary, children, defaultExpanded = false, className = '' }) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const contentRef = useRef(null);
    const [contentHeight, setContentHeight] = useState(defaultExpanded ? 'auto' : 0);

    const toggleAccordion = () => {
        setExpanded(!expanded);
    };

    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(expanded ? contentRef.current.scrollHeight : 0);
        }
    }, [expanded, children]);

    return (
        <div className={`custom-accordion ${expanded ? 'expanded' : ''} ${className}`}>
            <button
                type="button"
                className="accordion-header"
                onClick={toggleAccordion}
                aria-expanded={expanded}
            >
                <div className="accordion-header-content">
                    <h3 className="accordion-title">{title}</h3>
                    {!expanded && summary && (
                        <p className="accordion-summary">{summary}</p>
                    )}
                </div>
                <div className={`accordion-icon ${expanded ? 'rotated' : ''}`}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
            </button>
            <div
                className="accordion-body-wrapper"
                style={{ height: expanded ? 'auto' : `${contentHeight}px`, overflow: expanded ? 'visible' : 'hidden' }}
            >
                <div className="accordion-body" ref={contentRef}>
                    {children}
                </div>
            </div>
        </div>
    );
}
