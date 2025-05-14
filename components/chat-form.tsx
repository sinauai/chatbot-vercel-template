"use client"

import type React from "react"

import { useState, useEffect, Suspense, useRef } from "react"
import { cn } from "@/lib/utils"
import { useChat } from "ai/react"
import { ArrowUpIcon, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { AutoResizeTextarea } from "@/components/autoresize-textarea"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import { useEmbedMode } from "@/hooks/use-embed-mode"

type Source = {
  title: string
  url: string
}

// Komponen loading fallback
function ChatFormSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[35rem] flex-col items-stretch h-svh max-h-svh bg-white rounded-lg shadow-md border border-gray-200">
      <div className="flex-1 content-center overflow-y-auto px-6">
        <div className="m-auto flex max-w-96 flex-col gap-5 text-center">
          <div className="h-8 w-64 bg-gray-200 rounded-md mx-auto animate-pulse"></div>
          <div className="h-4 w-80 bg-gray-200 rounded-md mx-auto animate-pulse"></div>
        </div>
      </div>
      <div className="relative mx-6 mb-6 h-10 rounded-[16px] border bg-gray-100 animate-pulse"></div>
    </div>
  )
}

// Komponen utama dengan Suspense
export function ChatForm({ className, ...props }: React.ComponentProps<"form">) {
  return (
    <Suspense fallback={<ChatFormSkeleton />}>
      <ChatFormContent className={className} {...props} />
    </Suspense>
  )
}

// Komponen konten yang menggunakan useEmbedMode
function ChatFormContent({ className, ...props }: React.ComponentProps<"form">) {
  const isEmbedMode = useEmbedMode()

  const {
    messages: originalMessages,
    input,
    setInput,
    handleSubmit: handleChatSubmit,
    isLoading,
    stop,
  } = useChat({
    api: "/api/chat",
  })

  const [messageSources, setMessageSources] = useState<Record<string, Source[]>>({})
  const [processedMessages, setProcessedMessages] = useState<typeof originalMessages>([])
  const [newsData, setNewsData] = useState<any[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)

  // Deteksi posisi scroll sebelum pesan baru masuk
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.innerHeight + window.scrollY
      const threshold = document.body.offsetHeight - 100 // 100px dari bawah
      setShouldAutoScroll(scrollPosition >= threshold)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Auto-scroll ke bawah hanya jika user memang di bawah dan pesan terakhir adalah dari user
  useEffect(() => {
    const lastMessage = processedMessages[processedMessages.length - 1]
    if (
      shouldAutoScroll &&
      processedMessages.length > 0 &&
      lastMessage?.role === "user"
    ) {
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
      }, 100)
    }
    // Tidak ada auto-scroll jika pesan terakhir dari asisten (chatbot sedang mengetik)
  }, [processedMessages, shouldAutoScroll])

  useEffect(() => {
    // Fetch news metadata for source references
    async function fetchNewsMetadata() {
      try {
        const response = await fetch("/api/news/metadata")
        const data = await response.json()
        if (data.metadata) {
          setNewsData(data.metadata)
        }
      } catch (error) {
        console.error("Failed to fetch news metadata:", error)
      }
    }

    fetchNewsMetadata()
  }, [])

  useEffect(() => {
    // Deteksi apakah chatbot sedang memproses atau sudah mulai mengetik
    if (isLoading) {
      // Jika tidak ada pesan asisten yang sedang diproses, berarti masih dalam tahap loading awal
      const lastMessage = originalMessages[originalMessages.length - 1]
      if (!lastMessage || lastMessage.role !== "assistant" || lastMessage.content === "") {
        setIsProcessing(true)
      } else {
        // Jika sudah ada konten, berarti sudah mulai mengetik
        setIsProcessing(false)
      }
    } else {
      setIsProcessing(false)
    }
  }, [isLoading, originalMessages])

  useEffect(() => {
    // Process messages to extract sources and clean up content
    const newProcessedMessages = originalMessages.map((message) => {
      if (message.role === "assistant") {
        // Extract article references and clean up the message
        const { cleanContent, articleRefs } = extractAndCleanMessage(message.content)

        // Update sources if we found article references
        if (articleRefs.length > 0 && newsData.length > 0) {
          const uniqueRefs = [...new Set(articleRefs)]
          const sources = uniqueRefs
            .map((ref) => {
              const index = Number.parseInt(ref) - 1
              if (index >= 0 && index < newsData.length) {
                return {
                  title: newsData[index].title,
                  url: newsData[index].url,
                }
              }
              return null
            })
            .filter(Boolean) as Source[]

          if (sources.length > 0) {
            setMessageSources((prev) => ({
              ...prev,
              [message.id]: sources,
            }))
          }
        }

        // Return the message with cleaned content
        return {
          ...message,
          content: cleanContent,
        }
      }
      return message
    })

    setProcessedMessages(newProcessedMessages)

    // Notify parent window of height changes in embed mode
    if (isEmbedMode && typeof window !== "undefined" && window.parent !== window) {
      setTimeout(() => {
        const height = document.body.scrollHeight
        window.parent.postMessage({ type: "resize", height }, "*")
      }, 100)
    }
  }, [originalMessages, newsData, isEmbedMode])

  // Function to extract article references and clean up the message
  function extractAndCleanMessage(content: string): { cleanContent: string; articleRefs: string[] } {
    // Extract article references
    const articleRegex = /ARTIKEL\s+(\d+)/gi
    const matches = Array.from(content.matchAll(articleRegex))
    const articleRefs: string[] = []

    for (const match of matches) {
      if (match[1]) {
        articleRefs.push(match[1])
      }
    }

    // Clean up the content by removing trailing article references
    let cleanContent = content

    // Remove article references at the end of the message
    const trailingArticleRegex = /\s*ARTIKEL\s+\d+(\s+ARTIKEL\s+\d+)*\s*$/
    cleanContent = cleanContent.replace(trailingArticleRegex, "")

    // Remove any remaining "(ARTIKEL X)" references in the text
    cleanContent = cleanContent.replace(/$$ARTIKEL\s+\d+$$/gi, "")

    return { cleanContent, articleRefs }
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim()) return
    handleChatSubmit(e)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>)
    }
  }

  const welcomeHeader = (
    <header className="m-auto flex max-w-96 flex-col gap-5 text-center py-8">
      <h1 className="text-2xl font-semibold leading-none tracking-tight">Halo, Sahabat Kompas</h1>
      <p className="text-muted-foreground text-sm">
        Silakan ajukan pertanyaan terkait artikel yang Anda baca. Jawaban dibuat berdasarkan berita di Kompas.id.
      </p>
    </header>
  )

  // Pastikan messageList didefinisikan sebelum return
  const messageList = (
    <div className="my-4 flex h-fit min-h-full flex-col gap-4">
      {processedMessages.map((message, index) => (
        <div key={index} className="flex flex-col">
          <div
            data-role={message.role}
            className="max-w-[80%] rounded-xl px-3 py-2 text-sm data-[role=assistant]:self-start data-[role=user]:self-end data-[role=assistant]:bg-gray-100 data-[role=user]:bg-blue-500 data-[role=assistant]:text-black data-[role=user]:text-white"
          >
            {message.role === "assistant" ? (
              <div className="prose prose-sm max-w-none [&>p]:mb-4 [&>ul]:space-y-2 [&>ol]:space-y-2">
                <ReactMarkdown>
                  {message.content}
                </ReactMarkdown>
              </div>
            ) : (
              message.content
            )}
          </div>
          {/* Sources section */}
          {message.role === "assistant" && messageSources[message.id] && messageSources[message.id].length > 0 && (
            <div className="mt-1 self-start text-xs text-gray-500">
              <p className="font-medium">Sumber:</p>
              <ul className="mt-1 space-y-1">
                {messageSources[message.id].map((source, idx) => (
                  <li key={idx}>
                    <Link
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {source.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
      {/* Loading animation - hanya muncul saat memproses, bukan saat mengetik */}
      {isProcessing && (
        <div className="self-start rounded-xl bg-gray-100 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Sedang menyusun jawaban...</span>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <main
      className={cn(
        "min-h-screen flex flex-col items-center w-full max-w-[35rem] border border-gray-200 rounded-lg shadow-md bg-white mx-auto",
        isEmbedMode ? "h-full" : "",
        className,
      )}
      {...props}
    >
      <div className="flex-1 w-full px-6 flex flex-col" ref={chatContainerRef}>
        {processedMessages.length === 0 ? welcomeHeader : messageList}
      </div>
      <form
        onSubmit={handleSubmit}
        className="border-input bg-background focus-within:ring-ring/10 relative mb-6 flex items-center rounded-[16px] border px-3 py-1.5 pr-8 text-sm focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-0 w-full max-w-[90%] mx-auto"
      >
        <AutoResizeTextarea
          onKeyDown={handleKeyDown}
          onChange={(v) => setInput(v)}
          value={input}
          placeholder="Ketik pertanyaan Anda..."
          className="placeholder:text-muted-foreground flex-1 bg-transparent focus:outline-none"
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="absolute bottom-1 right-1 size-6 rounded-full"
                disabled={!input.trim() || isLoading}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpIcon size={16} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={12}>Kirim</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </form>
      {/* Footer - hide in embed mode if needed */}
      {!isEmbedMode && (
        <footer className="border-t border-gray-200 py-3 text-center text-xs text-gray-500 w-full">
          Chatbot bisa salah, cek kembali dengan membaca laporan{" "}
          <Link
            href="https://www.kompas.id/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Kompas.id
          </Link>
          .
        </footer>
      )}
    </main>
  )
}
