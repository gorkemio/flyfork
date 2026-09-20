# Aşama 3 müdahale matrisi — ön kayıt

Suppression bağımsız RK4 (.75±1e−10/.75/.2/.999), a→1, tam clamp, identity ve eski Synthetic golden testleri geçtikten sonra; gerçek müdahaleli matris çalıştırılmadan önce yazıldı. Model, kaynak paket, varsayılan arena/koku/decoder Aşama 2 ile aynı.

Seedler 1,42,2026. Her seed başlangıçtan 2 s S₀'ya ilerler. Tüm koşullar S₀'dan 12 s'ye (10 s karşılaştırma penceresi) ilerler; olay [3 s,8 s). Sekiz koşul: no-op; sol soma DM1_lPN suppression a=0,.5,1; ortak odor gain=0,.5,1,2. Sol PN kaynak ID'leri gerçek dataset seçimiyle alınır. Yeni seed/grup/parametre araması yok. Sıra sabit, tüm24 sonuç raporlanır.

Ölçümler: pencere PN ortalama ve farkı, raw ratio/hız, commanded speed, cap fraction/time, turn, displacement/path/net, collision stall fraction/time, A–Original position divergence, exploration, goal proximity/entry, intervention game cost. No-op/a0/gain1 tam numeric identity beklenir. Etkin müdahalede farklı rota/başarı zorunlu değil. Kendi geçmişiyle replay exact eşit olmalı; interbranch fark bağımsızdır. Gizli decoder/koku düzeltmesi yok. 10 s horizon fizibilite kapsamı; biyolojik doğrulama ve genel davranış iddiası yok.
