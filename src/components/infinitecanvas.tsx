'use client'

import { useEffect, useRef, useState } from 'react'
import { Canvas, PencilBrush, Point } from 'fabric'
import { supabase } from '@/lib/supabase'

export default function InfiniteCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasInstanceRef = useRef<Canvas | null>(null)

  const [canvasInstance, setCanvasInstance] =
    useState<Canvas | null>(null)

  const [color, setColor] = useState('#ff0000')
  const [brushSize, setBrushSize] = useState(10)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const initCanvas = async () => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      // FIX: size the canvas to the viewport instead of a fixed 10000x10000
      // surface. "Infinite" feel comes from panning/zooming the viewport,
      // not from an enormous backing canvas (which kills perf and breaks
      // mobile layout/visibility of overlays like the watermark).
      const canvas = new Canvas(canvasRef.current!, {
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 'white',
      })

      canvasInstanceRef.current = canvas

      ;(canvas as any).allowTouchScrolling = false

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

      // ---------------------------------------------------------------
      // FIX: brush state restoration helpers. Any pan/zoom gesture
      // (alt-drag on desktop, two-finger pan/pinch on mobile) now
      // temporarily disables drawing mode and restores it afterwards,
      // so the active tool (pencil/eraser) is never lost.
      // ---------------------------------------------------------------
      let wasDrawingMode = canvas.isDrawingMode

      const startGesture = () => {
        wasDrawingMode = canvas.isDrawingMode
        canvas.isDrawingMode = false
        canvas.selection = false
      }

      const endGesture = () => {
        canvas.isDrawingMode = wasDrawingMode
        canvas.selection = !wasDrawingMode
      }

      // ---------------------------------------------------------------
      // Desktop: alt + drag to pan
      // ---------------------------------------------------------------
      let isPanning = false

      canvas.on('mouse:down', (opt) => {
        const evt = opt.e as MouseEvent

        if (evt.altKey) {
          isPanning = true
          startGesture()
        }
      })

      canvas.on('mouse:move', (opt) => {
        if (!isPanning) return

        const evt = opt.e as MouseEvent

        const vpt = canvas.viewportTransform

        if (vpt) {
          vpt[4] += evt.movementX
          vpt[5] += evt.movementY
          canvas.setViewportTransform(vpt)
        }

        canvas.requestRenderAll()
      })

      canvas.on('mouse:up', () => {
        if (isPanning) {
          isPanning = false
          endGesture()
        }
      })

      // ---------------------------------------------------------------
      // Desktop: wheel to zoom
      // ---------------------------------------------------------------
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

      // ---------------------------------------------------------------
      // FIX: mobile two-finger pan + pinch-to-zoom. Listeners are bound
      // with passive: false so we can preventDefault() and stop the
      // browser's native scroll/zoom from competing with the canvas.
      // ---------------------------------------------------------------
      const wrapperEl: HTMLElement =
        (canvas as any).wrapperEl ??
        canvasRef.current!.parentElement ??
        canvasRef.current!

      let pinchState: {
        distance: number
        midpoint: { x: number; y: number }
      } | null = null

      const getTouchPoint = (touch: Touch) => {
        const rect = wrapperEl.getBoundingClientRect()
        return {
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
        }
      }

      const getDistance = (t0: Touch, t1: Touch) => {
        const p0 = getTouchPoint(t0)
        const p1 = getTouchPoint(t1)
        return Math.hypot(p1.x - p0.x, p1.y - p0.y)
      }

      const getMidpoint = (t0: Touch, t1: Touch) => {
        const p0 = getTouchPoint(t0)
        const p1 = getTouchPoint(t1)
        return {
          x: (p0.x + p1.x) / 2,
          y: (p0.y + p1.y) / 2,
        }
      }

      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          startGesture()

          pinchState = {
            distance: getDistance(e.touches[0], e.touches[1]),
            midpoint: getMidpoint(e.touches[0], e.touches[1]),
          }

          e.preventDefault()
        }
      }

      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 2 && pinchState) {
          const newDistance = getDistance(e.touches[0], e.touches[1])
          const newMidpoint = getMidpoint(e.touches[0], e.touches[1])

          // two-finger pan, based on midpoint movement
          const vpt = canvas.viewportTransform

          if (vpt) {
            vpt[4] += newMidpoint.x - pinchState.midpoint.x
            vpt[5] += newMidpoint.y - pinchState.midpoint.y
            canvas.setViewportTransform(vpt)
          }

          // pinch zoom, based on distance change between fingers
          if (pinchState.distance > 0) {
            let zoom =
              canvas.getZoom() * (newDistance / pinchState.distance)

            if (zoom > 20) zoom = 20
            if (zoom < 0.1) zoom = 0.1

            canvas.zoomToPoint(
              new Point(newMidpoint.x, newMidpoint.y),
              zoom
            )
          }

          pinchState = {
            distance: newDistance,
            midpoint: newMidpoint,
          }

          canvas.requestRenderAll()
          e.preventDefault()
        }
      }

      const handleTouchEnd = (e: TouchEvent) => {
        if (e.touches.length < 2 && pinchState) {
          pinchState = null
          endGesture()
        }
      }

      wrapperEl.addEventListener('touchstart', handleTouchStart, {
        passive: false,
      })
      wrapperEl.addEventListener('touchmove', handleTouchMove, {
        passive: false,
      })
      wrapperEl.addEventListener('touchend', handleTouchEnd, {
        passive: false,
      })
      wrapperEl.addEventListener('touchcancel', handleTouchEnd, {
        passive: false,
      })

      // ---------------------------------------------------------------
      // FIX: keep the canvas sized to the viewport on resize/orientation
      // change so it never grows beyond the visible screen.
      // ---------------------------------------------------------------
      const handleResize = () => {
        canvas.setDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        })
        canvas.requestRenderAll()
      }

      window.addEventListener('resize', handleResize)

      ;(canvas as any).__cleanup = () => {
        window.removeEventListener('resize', handleResize)
        wrapperEl.removeEventListener('touchstart', handleTouchStart)
        wrapperEl.removeEventListener('touchmove', handleTouchMove)
        wrapperEl.removeEventListener('touchend', handleTouchEnd)
        wrapperEl.removeEventListener('touchcancel', handleTouchEnd)
      }
    }

    initCanvas()

    // -------------------------------------------------------------------
    // FIX: lock page scroll/zoom while this component is mounted so
    // browser scrolling/pinch-zoom doesn't fight with canvas gestures
    // on touch devices.
    // -------------------------------------------------------------------
    const originalHtmlOverflow = document.documentElement.style.overflow
    const originalBodyOverflow = document.body.style.overflow
    const originalBodyMargin = document.body.style.margin
    const originalHtmlTouchAction = document.documentElement.style.touchAction

    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    document.body.style.margin = '0'
    document.documentElement.style.touchAction = 'none'

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow
      document.body.style.overflow = originalBodyOverflow
      document.body.style.margin = originalBodyMargin
      document.documentElement.style.touchAction = originalHtmlTouchAction

      if (canvasInstanceRef.current) {
        ;(canvasInstanceRef.current as any).__cleanup?.()
        canvasInstanceRef.current.dispose()
        canvasInstanceRef.current = null
      }
    }
  }, [color, brushSize])

  const saveCanvas = async () => {
    if (!canvasInstance || !userId) return

    const data = canvasInstance.toJSON()

    const { error } = await supabase
      .from('drawings')
      .insert([{ data, user_id: userId }])

    if (error) {
      console.error(error)
      alert('Save failed')
    } else {
      alert('Saved')
    }
  }

  // FIX: Clear button handler — deletes only the current user's drawings
  // from the database and clears the canvas. Does not affect other users' drawings.
  const clearCanvas = async () => {
    if (!canvasInstance || !userId) return

    // Delete current user's drawings from database
    const { error } = await supabase
      .from('drawings')
      .delete()
      .eq('user_id', userId)

    if (error) {
      console.error(error)
      alert('Clear failed')
      return
    }

    // Clear the canvas display
    canvasInstance.clear()
    canvasInstance.backgroundColor = 'white'

    if (canvasInstance.freeDrawingBrush) {
      canvasInstance.freeDrawingBrush.color = color
      canvasInstance.freeDrawingBrush.width = brushSize
    }

    canvasInstance.isDrawingMode = true
    canvasInstance.requestRenderAll()
    alert('Your drawings cleared')
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

    canvasInstance.isDrawingMode = true
    canvasInstance.freeDrawingBrush.color =
      color
  }

  const activateEraser = () => {
    if (!canvasInstance?.freeDrawingBrush) return

    canvasInstance.isDrawingMode = true
    canvasInstance.freeDrawingBrush.color =
      'white'
  }

  return (
    // FIX: viewport-locked wrapper. Combined with the canvas now being
    // sized to window.innerWidth/innerHeight, this keeps the watermark
    // and toolbar correctly positioned and visible on mobile.
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        touchAction: 'none',
      }}
    >
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
          flexWrap: 'wrap',
          maxWidth: 'calc(100vw - 20px)',
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
          onClick={clearCanvas}
          style={{
            background: '#6b7280',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Clear
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

      <canvas
        ref={canvasRef}
        style={{
          touchAction: 'none',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
      />
    </div>
  )
}