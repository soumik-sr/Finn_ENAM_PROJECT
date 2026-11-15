"""Local HTTP, extraction, cache, calculation and failure-retention checks."""
import io
import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import Request, urlopen
from unittest.mock import patch
import backend as b
import refresh
import warm_research

class Checks(unittest.TestCase):
    def test_cache_refresh_preserves_global_profiles(self):
        with tempfile.TemporaryDirectory(dir='.') as temp:
            root=Path(temp);(root/'dist').mkdir()
            target=root/'dist'/'research-cache.json'
            target.write_text(json.dumps({'companies':{'NVDA':[{'text':'retained global profile'}]}}))
            with patch.object(warm_research,'ROOT',root),patch.object(warm_research,'index_company',side_effect=lambda symbol:(symbol,[{'text':'refreshed'}])):
                warm_research.main()
            self.assertIn('NVDA',json.loads(target.read_text())['companies'])

    def test_reviewed_profiles(self):
        for name in ('NVIDIA','TESLA','APPLE','MICROSOFT','JPL'):
            symbol=b.ticker(name)
            response=b.research(symbol,'IPO issue price' if symbol=='JIO' else 'revenue growth')
            self.assertTrue(response['evidence'],symbol)
            self.assertFalse(b.research(symbol,'What is the FY29 dividend payout target?')['evidence'])

    def test_market_arithmetic_and_cache(self):
        payload={'chart':{'result':[{'timestamp':[1700000000+i*86400 for i in range(21)],'indicators':{'quote':[{'close':[100]*20+[110],'volume':[100]*20+[300]}]}}]}}
        with tempfile.TemporaryDirectory(dir='.') as temp, patch.object(b,'CACHE',Path(temp)),patch.object(b,'fetch',return_value=json.dumps(payload).encode()) as fetch:
            result=b.market('INFY')
            self.assertAlmostEqual(result['priceChangePct'],10)
            self.assertEqual(result['volumeMultiple'],3)
            self.assertEqual(b.market('INFY'),result)
            self.assertEqual(fetch.call_count,1)

    def test_refresh_retains_previous_records(self):
        with tempfile.TemporaryDirectory(dir='.') as temp,patch.object(refresh,'DIST',Path(temp)):
            refresh.merge('test.json',[{'id':1,'value':'stored'}],lambda r:r['id'])
            refresh.merge('test.json',[],lambda r:r['id'])
            self.assertEqual(json.loads((Path(temp)/'test.json').read_text()),[{'id':1,'value':'stored'}])

    def test_local_http(self):
        server=b.ThreadingHTTPServer(('127.0.0.1',0),b.Handler)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            root='http://127.0.0.1:'+str(server.server_port)
            self.assertEqual(urlopen(root+'/coverage.json').status,200)
            request=Request(root+'/api/research',data=json.dumps({'ticker':'NVDA','question':'revenue'}).encode(),headers={'Content-Type':'application/json'})
            self.assertTrue(json.load(urlopen(request))['evidence'])
        finally:server.shutdown();server.server_close()

if __name__=='__main__':unittest.main(verbosity=2)
