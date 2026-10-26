"""Optional: python tests/browser_landing.py (requires Playwright and Chromium)."""
from playwright.sync_api import sync_playwright
from pathlib import Path
base = Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'])
    context = browser.new_context(viewport={'width':412,'height':915}, device_scale_factor=2.75, is_mobile=True, has_touch=True)
    page = context.new_page()
    page.set_content('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><h1>SOL SKATE board rotation test</h1>')
    page.add_script_tag(path=str(base / 'landing.js'))
    result = page.evaluate("""() => {
      const s={};
      const P=window.SOLLanding;
      const early=P.canLand(s,1,0);
      for(let i=0;i<48;i++)P.step(s,1,0,1/60);
      const complete=P.canLand(s,1,0);
      const roll=s.rollAngle;
      P.reset(s);
      return {early,complete,roll,reset:P.canLand(s,0,0),touch:navigator.maxTouchPoints>0};
    }""")
    assert result['early'] is False and result['complete'] is True and result['reset'] is True, result
    assert result['touch'] is True, result
    print('Chromium Galaxy-sized touch emulation: rotation/landing passed', result)
    browser.close()
