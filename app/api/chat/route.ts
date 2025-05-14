import { type CoreMessage, streamText } from "ai"
import { openai } from "@ai-sdk/openai"
import newsData from "@/news.json"

export async function POST(req: Request) {
  const { messages }: { messages: CoreMessage[] } = await req.json()

  // Prepare context from news data
  const newsContext = newsData
    .map((article, index) => {
      return `ARTIKEL ${index + 1}:
JUDUL: ${article.title}
URL: ${article.url}

${article.full_text}`
    })
    .join("\n\n---\n\n")

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: `Anda adalah asisten AI yang membantu menjawab pertanyaan berdasarkan berita di Kompas.id.
    
    Anda HANYA boleh menjawab pertanyaan berdasarkan informasi yang terdapat dalam konteks berita berikut:
    
    ${newsContext}
    
    Jika pertanyaan tidak terkait dengan informasi dalam konteks berita, jawablah "Maaf, saya tidak memiliki informasi tentang itu." 
    
    PENTING:
    1. Format jawaban Anda dalam Markdown yang rapi untuk meningkatkan keterbacaan.
    2. Gunakan paragraf, poin-poin, dan penekanan (bold/italic) dengan tepat.
    3. JANGAN menyertakan referensi seperti "(ARTIKEL X)" dalam jawaban Anda. Pengguna sudah dapat melihat sumber informasi di bagian terpisah.
    4. Tetap gunakan informasi dari artikel yang relevan, tetapi jangan menyebutkan nomor artikelnya dalam teks jawaban.
    5. Untuk keperluan internal sistem, tetap sertakan kode artikel yang Anda gunakan di AKHIR jawaban Anda dengan format: "ARTIKEL 1 ARTIKEL 2" (jika Anda menggunakan artikel 1 dan 2). Kode ini akan dihapus sebelum ditampilkan kepada pengguna.
    
    Jawablah dalam Bahasa Indonesia yang baik dan benar.`,
    messages,
    temperature: 0.7,
  })

  return result.toDataStreamResponse()
}
