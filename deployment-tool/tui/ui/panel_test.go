package ui

import (
	"strings"
	"testing"
)

func TestCalcSplitSizes(t *testing.T) {
	t.Parallel()
	s := CalcSplit(120, 40, 10)
	if s.BodyH != 30 {
		t.Fatalf("BodyH=%d", s.BodyH)
	}
	if s.LeftW < 22 || s.RightW < 28 {
		t.Fatalf("narrow panes: %+v", s)
	}
	if s.LeftW+s.RightW > 120 {
		t.Fatalf("panes exceed term: %+v", s)
	}
}

func TestPanelInnerAndListSizes(t *testing.T) {
	t.Parallel()
	iw, ih := PanelInnerSize(40, 20)
	if iw != 38 || ih != 18 {
		t.Fatalf("inner=%d,%d", iw, ih)
	}
	lw, lh := ListSizeInPanel(40, 20)
	if lw > iw || lh > ih || lw < 10 || lh < 5 {
		t.Fatalf("list=%d,%d inner=%d,%d", lw, lh, iw, ih)
	}
	vw, vh := ViewportSizeInPanel(40, 20)
	if vw < 12 || vh < 5 {
		t.Fatalf("viewport=%d,%d", vw, vh)
	}
}

func TestRenderPanelAndJoin(t *testing.T) {
	t.Parallel()
	p := RenderPanel("NAV", "row", 36, 12)
	if !strings.Contains(p, "NAV") || !strings.Contains(p, "row") {
		t.Fatalf("panel: %q", p[:min(120, len(p))])
	}
	joined := JoinPanes(p, RenderPanel("OUT", "log", 40, 12))
	if !strings.Contains(joined, "NAV") || !strings.Contains(joined, "OUT") {
		t.Fatalf("join missing panes")
	}
	help := HelpLine(80, "↑↓ select")
	if !strings.Contains(help, "select") {
		t.Fatalf("help: %q", help)
	}
}

func TestViewportFollowAndPreserve(t *testing.T) {
	t.Parallel()
	vp := NewOutputViewport("a\nb\nc\nd\ne\nf\ng\nh\ni\nj")
	SizeViewport(&vp, 40, 4)
	if vp.MouseWheelEnabled {
		t.Fatal("home/builder viewports disable mouse wheel")
	}
	if !vp.SoftWrap {
		t.Fatal("soft wrap should be on")
	}
	SetViewportText(&vp, strings.Repeat("line\n", 40), true)
	if !vp.AtBottom() {
		t.Fatal("followBottom should pin to bottom")
	}
	vp.SetYOffset(0)
	SetViewportText(&vp, strings.Repeat("line\n", 40)+"tail\n", false)
	if vp.YOffset() != 0 {
		t.Fatalf("preserve offset: got %d", vp.YOffset())
	}
	SizeViewport(nil, 10, 10) // no panic
	SetViewportText(nil, "x", true)
}
