'use client'

import { useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

interface LaTeXProps {
  children: string
  displayMode?: boolean
  className?: string
}

export default function LaTeX({ children, displayMode = false, className = '' }: LaTeXProps) {
  const containerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      const renderStrategies = [
        // Strategy 1: Try as-is
        () => children,
        // Strategy 2: Clean up common issues
        () => children
          .replace(/\\,/g, '\\,') // Ensure thin spaces are preserved
          .replace(/\\\\/g, '\\'), // Fix double backslashes if any
        // Strategy 3: Try with math mode delimiters
        () => `{${children}}`,
        // Strategy 4: Simple fallback
        () => children.replace(/\\/g, '')
      ]

      let rendered = false
      
      for (const strategy of renderStrategies) {
        try {
          const latex = strategy()
          katex.render(latex, containerRef.current, {
            displayMode,
            throwOnError: true, // Throw error to try next strategy
            strict: 'ignore',
            trust: true,
            macros: {
              '\\tfrac': '\\frac',
              '\\dfrac': '\\frac',
              '\\lVert': '\\left\\|',
              '\\rVert': '\\right\\|',
              '\\Delta': '\\Delta',
              '\\theta': '\\theta',
              '\\sin': '\\sin',
              '\\cos': '\\cos',
              '\\sqrt': '\\sqrt',
              '\\vec': '\\vec',
              '\\cdot': '\\cdot',
              '\\times': '\\times',
              '\\mu': '\\mu',
              '\\alpha': '\\alpha',
              '\\beta': '\\beta',
              '\\gamma': '\\gamma',
              '\\pi': '\\pi',
              '\\rho': '\\rho',
              '\\sigma': '\\sigma',
              '\\omega': '\\omega',
              '\\Omega': '\\Omega',
              '\\phi': '\\phi',
              '\\Phi': '\\Phi',
              '\\psi': '\\psi',
              '\\Psi': '\\Psi',
              '\\chi': '\\chi',
              '\\eta': '\\eta',
              '\\kappa': '\\kappa',
              '\\lambda': '\\lambda',
              '\\Lambda': '\\Lambda',
              '\\nu': '\\nu',
              '\\xi': '\\xi',
              '\\Xi': '\\Xi',
              '\\tau': '\\tau',
              '\\upsilon': '\\upsilon',
              '\\Upsilon': '\\Upsilon',
              '\\zeta': '\\zeta'
            }
          })
          rendered = true
          break
        } catch (error) {
          // Try next strategy
          continue
        }
      }
      
      if (!rendered) {
        console.warn('All LaTeX rendering strategies failed for:', children)
        // Final fallback: show raw text
        if (containerRef.current) {
          containerRef.current.textContent = children
        }
      }
    }
  }, [children, displayMode])

  return <span ref={containerRef} className={className} />
}

// Helper function to render text with inline LaTeX
export function renderTextWithLaTeX(text: string, className?: string): JSX.Element {
  // First, handle explicitly delimited LaTeX
  if (text.includes('\\(') || text.includes('\\[') || text.includes('$')) {
    const parts = text.split(/(\\\(.*?\\\)|\\\[.*?\\\]|\$.*?\$)/g)
    
    return (
      <span className={className}>
        {parts.map((part, index) => {
          if (part.match(/^\\\((.*)\\\)$/)) {
            const latex = part.replace(/^\\\(|\\\)$/g, '')
            return <LaTeX key={index} displayMode={false}>{latex}</LaTeX>
          } else if (part.match(/^\\\[(.*)\\\]$/)) {
            const latex = part.replace(/^\\\[|\\\]$/g, '')
            return <LaTeX key={index} displayMode={true}>{latex}</LaTeX>
          } else if (part.match(/^\$(.*)\$$/)) {
            const latex = part.replace(/^\$|\$$/g, '')
            return <LaTeX key={index} displayMode={false}>{latex}</LaTeX>
          } else {
            return <span key={index}>{part}</span>
          }
        })}
      </span>
    )
  }
  
  // Check if this looks like a mathematical equation
  const isEquation = text.includes('=') && /\\[a-zA-Z]/.test(text)
  
  // Check for specific LaTeX indicators that suggest the whole thing should be LaTeX
  const hasComplexLaTeX = text.includes('\\frac') || 
                         text.includes('\\tfrac') || 
                         text.includes('\\dfrac') ||
                         text.includes('\\vec') ||
                         text.includes('\\lVert') ||
                         text.includes('\\rVert') ||
                         text.includes('_{') ||
                         text.includes('^{') ||
                         text.includes('\\,') ||
                         text.includes('\\cdot') ||
                         text.includes('\\times') ||
                         text.includes('\\alpha') ||
                         text.includes('\\beta') ||
                         text.includes('\\gamma')
  
  if (isEquation || hasComplexLaTeX) {
    // Render the entire text as LaTeX
    return (
      <span className={className}>
        <LaTeX displayMode={false}>{text}</LaTeX>
      </span>
    )
  }
  
  // For mixed content with simple LaTeX, try to split more carefully
  if (/\\[a-zA-Z]/.test(text)) {
    // Look for parenthetical expressions that might not be LaTeX
    if (text.includes('(') && text.includes(')') && !hasComplexLaTeX) {
      // This might be mixed content like "W = 0 (direction change only)"
      // Split by parentheses and handle each part
      const parts = text.split(/(\([^)]*\))/g)
      
      return (
        <span className={className}>
          {parts.map((part, index) => {
            if (part.startsWith('(') && part.endsWith(')') && !/\\[a-zA-Z]/.test(part)) {
              // This is a parenthetical comment, not LaTeX
              return <span key={index}>{part}</span>
            } else if (/\\[a-zA-Z]/.test(part)) {
              // This part has LaTeX
              return <LaTeX key={index} displayMode={false}>{part}</LaTeX>
            } else {
              // Regular text
              return <span key={index}>{part}</span>
            }
          })}
        </span>
      )
    }
    
    // Default: treat as LaTeX if it has backslash commands
    return (
      <span className={className}>
        <LaTeX displayMode={false}>{text}</LaTeX>
      </span>
    )
  }
  
  // No LaTeX detected, return as plain text
  return <span className={className}>{text}</span>
}
