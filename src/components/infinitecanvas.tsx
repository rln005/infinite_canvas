'use client'

import { useEffect, useRef, useState } from 'react'
import { Canvas, PencilBrush, Point } from 'fabric'
import { supabase } from '@/lib/supabase'

export default function InfiniteCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [canvasInstance, setCanvasInstance] =
    useState<Canvas | null>(null)

  const [color, setColor] = useState('#ff0000')
  const [brushSize, setBrushSize] = useState(10)

  useEffect(() => {
    if (!canvasRef.current) return

    const initCanvas = async () => {
      const canvas = new Canvas(canvasRef.current!, {
        width: 10000,
        height: 10000,
        backgroundColor: 'white',
      })

      const brush = new PencilBrush(canvas)
      brush.color = color
      brush.width = brushSize

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

      let isPanning = false

      canvas.on('mouse:down', (opt) => {
        const evt = opt.e as MouseEvent

        if (evt.altKey) {
          isPanning = true
          canvas.selection = false
        }
      })

      canvas.on('mouse:move', (opt) => {
        if (!isPanning) return

        const evt = opt.e as MouseEvent

        const vpt = canvas.viewportTransform

        if (vpt) {
          vpt[4] += evt.movementX
          vpt[5] += evt.movementY
        }

        canvas.requestRenderAll()
      })

      canvas.on('mouse:up', () => {
        isPanning = false
        canvas.selection = true
      })

      canvas.on('mouse:wheel', (opt) => {
        const delta = opt.e.deltaY

        let zoom = canvas.getZoom()

        zoom *= 0.999 ** delta

        if (zoom > 20) zoom = 20

        if (zoom < 0.1) zoom = 0.1

        canvas.zoomToPoint(
          new Point(opt.e.offsetX, opt.e.offsetY),
          zoom
        )

        opt.e.preventDefault()
        opt.e.stopPropagation()
      })
    }

    initCanvas()
  }, [])

  const saveCanvas = async () => {
    if (!canvasInstance) return

    const data = canvasInstance.toJSON()

    const { error } = await supabase
      .from('drawings')
      .insert([{ data }])

    if (error) {
      console.error(error)
      alert('Save failed')
    } else {
      alert('Saved')
    }
  }

  const changeColor = (newColor: string) => {
    setColor(newColor)

    if (canvasInstance?.freeDrawingBrush) {
      canvasInstance.freeDrawingBrush.color =
        newColor
    }
  }

  const changeBrushSize = (size: number) => {
    setBrushSize(size)

    if (canvasInstance?.freeDrawingBrush) {
      canvasInstance.freeDrawingBrush.width =
        size
    }
  }

  const activateBrush = () => {
    if (!canvasInstance?.freeDrawingBrush) return

    canvasInstance.freeDrawingBrush.color =
      color
  }

  const activateEraser = () => {
    if (!canvasInstance?.freeDrawingBrush) return

    canvasInstance.freeDrawingBrush.color =
      'white'
  }

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 10,
          left: 10,
          zIndex: 9999,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          padding: 12,
          background: '#1f2937',
          color: 'white',
          borderRadius: 10,
          boxShadow:
            '0 4px 20px rgba(0,0,0,0.2)',
        }}
      >
        <button
          onClick={saveCanvas}
          style={{
            background: '#2563eb',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Save
        </button>

        <button
          onClick={activateBrush}
          style={{
            background: '#10b981',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Pencil
        </button>

        <button
          onClick={activateEraser}
          style={{
            background: '#ef4444',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Eraser
        </button>

        <input
          type="color"
          value={color}
          onChange={(e) =>
            changeColor(e.target.value)
          }
        />

        <input
          type="range"
          min="1"
          max="50"
          value={brushSize}
          onChange={(e) =>
            changeBrushSize(
              Number(e.target.value)
            )
          }
        />

        <span>{brushSize}px</span>
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 9999,
          padding: '10px 14px',
          background: 'rgba(31,41,55,0.75)',
          backdropFilter: 'blur(8px)',
          color: 'rgba(255,255,255,0.9)',
          borderRadius: '12px',
          fontSize: '13px',
          fontWeight: '600',
          letterSpacing: '0.5px',
          userSelect: 'none',
          pointerEvents: 'none',
          boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
        }}
      >
        Made by
        <br />
        R.L. Narayana
      </div>
      <canvas ref={canvasRef} />
    </>
  )
}