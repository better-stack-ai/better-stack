'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Copy,
  Check,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { SiGithub, SiOpenai, SiClaude } from 'react-icons/si';
import { VscCopilot } from 'react-icons/vsc';

interface LLMCopyButtonProps {
  markdownUrl: string;
}

export function LLMCopyButton({ markdownUrl }: LLMCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCopy = async () => {
    setLoading(true);
    try {
      const response = await fetch(markdownUrl);
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCopy}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-fd-border bg-fd-background hover:bg-fd-accent transition-colors disabled:opacity-50"
      title="Copy page as Markdown"
    >
      {copied ? (
        <Check className="size-4 text-green-500" />
      ) : (
        <Copy className="size-4" />
      )}
      <span>{copied ? 'Copied!' : 'Copy Markdown'}</span>
    </button>
  );
}

interface ViewOptionsProps {
  markdownUrl: string;
  githubUrl?: string;
}

export function ViewOptions({ markdownUrl, githubUrl }: ViewOptionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const options = [
    ...(githubUrl
      ? [
          {
            label: 'View on GitHub',
            icon: <SiGithub className="size-4" />,
            href: githubUrl,
          },
        ]
      : []),
    {
      label: 'Open in ChatGPT',
      icon: <SiOpenai className="size-4" />,
      href: `https://chatgpt.com/?q=${encodeURIComponent(`Read this documentation and help me understand it:\n\n${typeof window !== 'undefined' ? window.location.origin : ''}${markdownUrl}`)}`,
    },
    {
      label: 'Open in Claude',
      icon: <SiClaude className="size-4" />,
      href: `https://claude.ai/new?q=${encodeURIComponent(`Read this documentation and help me understand it:\n\n${typeof window !== 'undefined' ? window.location.origin : ''}${markdownUrl}`)}`,
    },
    {
      label: 'Open in Copilot',
      icon: <VscCopilot className="size-4" />,
      href: `https://copilot.microsoft.com/?q=${encodeURIComponent(`Read this documentation and help me understand it:\n\n${typeof window !== 'undefined' ? window.location.origin : ''}${markdownUrl}`)}`,
    },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-fd-border bg-fd-background hover:bg-fd-accent transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <ExternalLink className="size-4" />
        <span>Open in</span>
        <ChevronDown className={`size-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-48 rounded-lg border border-fd-border bg-fd-popover shadow-lg">
          <div className="py-1">
            {options.map((option) => (
              <a
                key={option.label}
                href={option.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-sm text-fd-popover-foreground hover:bg-fd-accent transition-colors"
                onClick={() => setIsOpen(false)}
              >
                {option.icon}
                <span>{option.label}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface PageActionsProps {
  markdownUrl: string;
  githubUrl?: string;
}

export function PageActions({ markdownUrl, githubUrl }: PageActionsProps) {
  return (
    <div className="flex flex-row gap-2 items-center not-prose mb-6">
      <LLMCopyButton markdownUrl={markdownUrl} />
      <ViewOptions markdownUrl={markdownUrl} githubUrl={githubUrl} />
    </div>
  );
}

