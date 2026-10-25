import unittest
from online import platform_asset,public_link
class OnlineTests(unittest.TestCase):
 def test_control_api_is_never_displayed_as_the_game_link(self):
  self.assertIsNone(public_link('Post https://api.trycloudflare.com/tunnel: network unreachable'))
  self.assertEqual(public_link('| https://clear-green-racing-friends.trycloudflare.com |'),'https://clear-green-racing-friends.trycloudflare.com')
 def test_official_download_platform_selection(self):
  self.assertEqual(platform_asset('Windows','AMD64'),'cloudflared-windows-amd64.exe');self.assertEqual(platform_asset('Darwin','arm64'),'cloudflared-darwin-arm64.tgz');self.assertEqual(platform_asset('Linux','x86_64'),'cloudflared-linux-amd64')
if __name__=='__main__':unittest.main()
