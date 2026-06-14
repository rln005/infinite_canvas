'use client'

import { useEffect, useRef, useState } from 'react'
import { Canvas, PencilBrush } from 'fabric'
import { supabase } from '@/lib/superbase'

export default function InfiniteCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [canvasInstance, setCanvasInstance] = useState<Canvas | null>(null)

useEffect(() => {
  if (!canvasRef.current) return

  const initCanvas = async () => {
    const canvas = new Canvas(canvasRef.current!, {
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 'white',
    })

    const brush = new PencilBrush(canvas)
    brush.color = 'red'
    brush.width = 10

    canvas.freeDrawingBrush = brush
    canvas.isDrawingMode = true

    setCanvasInstance(canvas)

    const { data } = await supabase
      .from('drawings')
      .select('*')
      .order('id', { ascending: false })
      .limit(1)

    if (data && data.length > 0) {
      await canvas.loadFromJSON(data[0].data)
      canvas.requestRenderAll()
    }
  }

  initCanvas()
}, [])

  const saveCanvas = async () => {
    if (!canvasInstance) return

    const data = canvasInstance.toJSON()

    const { error } = await supabase
      .from('drawings')
      .insert([
        {
          data: data,
        },
      ])

    if (error) {
      console.error(error)
      alert('Save failed')
    } else {
      alert('Saved successfully')
    }
  }

  return (
    <>
      <button
        onClick={saveCanvas}
        style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          zIndex: 9999,
          padding: '10px 20px',
          background: 'black',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Save
      </button>

      <canvas ref={canvasRef} />
    </>
  )
}