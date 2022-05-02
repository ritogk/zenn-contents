---
title: "tymon/jwt-authで安全にマルチ認証を実装する。"
emoji: "😽"
type: "tech"
topics: ["laravel", "tymon/jwt-auth", "jwt"] #
published: true
---

# 概要

tymon/jwt-auth で生成した jwt をクッキーに保管した際のマルチ認証の実装メモです。

# jwt-auth で生成した jwt をクッキーで管理するとちょっと面倒

laravel で jwt の生成と認証をしようと思うと「tymon/jwt-auth」を使う事になると思います。
ログイン認証情報の jwt を簡単に生成できて便利なんですが、jwt をクッキーで管理してマルチ認証をしようとした場合は別。
なぜなら jwt を格納するクッキー名が「tymon/jwt-auth」側が用意している「token」しか使えないから。
そうなるとブラウザ側で jwt_admin、jwt_user を持たせるみたいな事はできない。

authorization ヘッダとかクエリパラメータに jwt を付与して送信すれば特に何も問題ないが、そうなると jwt の保管先がローカルストレージか js のグローバル変数とかになってくる。
外部ライブラリをバリバリに使いたいので jwt は httpinly 属性付きの cookie に保存しておきたい。

# 結論

jwt を含むクッキーは独自の名前で持っておいて
それを laravel のミドルウェア側で authrorization ヘッダーにくっつけて処理を流すようにする。

# コード

```php title="api.php"
Route::group(['prefix' => 'auth'], function () {
    // 管理者
    Route::group(['prefix' => 'admin'], function () {
        Route::get('/me', [Controllers\Api\V1\AuthAdminController::class, 'me'])->middleware(['auth:admin']);
        Route::post('/login', [Controllers\Api\V1\AuthAdminController::class, 'login']);
    });
    // ユーザー
    Route::group(['prefix' => 'front'], function () {
        Route::get('/me', [Controllers\Api\V1\AuthFrontController::class, 'me'])->middleware(['auth:user']);
        Route::post('/login', [Controllers\Api\V1\AuthFrontController::class, 'login']);
    });
});
```

```php title="AddAuthorizationHeader.php"
<?php

namespace App\Http\Middleware\JwtAuth;
use Closure;
use Illuminate\Http\Request;

class AddAuthorizationHeader
{
    public function handle(Request $request, Closure $next)
    {
        $jwt = '';
        // ルート側で持っているmiddlewareを取得
        $current_route_middlewares = $request->route()->computedMiddleware;
        if (in_array('auth:user', $current_route_middlewares)) {
            $jwt = $request->cookie('jwt_user');
        } else if (in_array('auth:admin', $current_route_middlewares)) {
            $jwt = $request->cookie('jwt_admin');
        }
        if ($jwt) {
            // Authorizationヘッダー追加
            $request->headers->set('Authorization', 'Bearer ' . $jwt);
        }

        return $next($request);;
    }
}
```

```php title="kernel.php"
'api' => [
            \App\Http\Middleware\EncryptCookies::class,
            \App\Http\Middleware\JwtAuth\AddAuthorizationHeader::class, ※追加
            \Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
            'throttle:60,1',
            \Illuminate\Routing\Middleware\SubstituteBindings::class,
        ],
```
