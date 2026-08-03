import React from 'react';
import ReactMarkdown from 'react-markdown';

type SessionMessageMarkdownProps = {
  children: string;
};

const markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  p: ({ children }) => <p className="whitespace-pre-wrap [&+p]:mt-3">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-neutral-800">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  h1: ({ children }) => <h1 className="mb-2 mt-4 text-[18px] font-semibold text-neutral-800">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-[17px] font-semibold text-neutral-800">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-3 text-[16px] font-semibold text-neutral-800">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-neutral-300 pl-4 text-neutral-600">{children}</blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-500"
    >
      {children}
    </a>
  ),
};

export default function SessionMessageMarkdown({ children }: SessionMessageMarkdownProps) {
  return <ReactMarkdown components={markdownComponents}>{children}</ReactMarkdown>;
}
