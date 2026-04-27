# Security Policy

## 回報安全漏洞

如果你發現 Arena Card Generator 有安全問題,**請不要開 public issue**。

請寄信到 xypro.ai@gmail.com,主旨開頭加 `[SECURITY]`,附上重現步驟跟影響範圍。我們會在 7 天內回覆。

公開揭露會等修補完成 + release 之後。

## 涵蓋範圍

- App 主程式(Electron main / preload / renderer)
- 自動更新機制
- API key 的儲存與傳輸

## 不在範圍

- 第三方 dependency 的已知 CVE(請直接報給對應 upstream)
- 需要實體存取電腦才能利用的問題
- macOS Gatekeeper / Windows SmartScreen 跳警告(因未做 code signing,屬已知設計)
