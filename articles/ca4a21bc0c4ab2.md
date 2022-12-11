---
title: "symfony初心者がメールテンプレを使用しているときにファイルを添付させたら色々大変だった話"
emoji: "🎶"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [symfony]
published: true
published_at: 2022-12-18 00:01
---

[Symfony Advent Calendar 2022](https://qiita.com/advent-calendar/2022/symfony) 18 日目の記事です ✨

# はじめに

実務で symfony を使ってメール送信を実装する機会がありました。
その時にスラスラ実装できなくてしんどかったのでその時のメモを残しておきます。

# 今回のゴール

問い合わせフォームから送信された内容を外部ファイルに切り出したメールテンプレートに埋め込み、ファイルを添付してメッセンジャーのキューへ送信する所までをゴールとします。
https://github.com/ritogk/symfony_mail_test

# 動作環境

windows 11
wsl2(Ubuntu 20.04)
php 8.1.12
symfony 6.2

# とりあえず単純なテキストメールを送信してみる

symfony を使ってメールを送信した事がないので[公式ドキュメント](https://symfony.com/doc/current/mailer.html)を頼りに単純なテキストメールを送信してみる
https://symfony.com/doc/current/mailer.html

symfony_mailer を インストール

```bash
$ composer require symfony/mailer
```

今回の記事ではメールを送信しないのでメーラーの指定はしない。

```:.env
MAILER_DSN=null://null
```

```php:MailerController.php
<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Mime\Email;
use Symfony\Component\Routing\Annotation\Route;

class MailerController extends AbstractController
{
  #[Route('/email')]
  public function sendEmail(MailerInterface $mailer): Response
  {
    $email = (new Email())
      ->from('hello@example.com')
      ->to('you@example.com')
      ->subject('Symfonyからのテストメールです！')
      ->text('メール内容はないよう');

    $mailer->send($email);

    return $this->render('index.html.twig');
  }
}
```

この状態で「/email」にアクセスしてメールを送信してみると・・・

**「An exception occurred while executing a query: SQLSTATE[42S02]: Base table or view not found: 1146 Table 'symfony_mailer.messenger_messages' doesn't exist」**
![1](/images/symfony/1.png)

messenger_messages テーブルがないと怒られました。

migrations ディレクトリ内に「messenger_messages」のテーブル定義は存在しないしデータベース内にも存在しない。
なにこれどうすればいいの・・・？

```bash
MariaDB [symfony_mailer]> show tables;
Empty set (0.000 sec)
```

調べてみるとメッセンジャーを動かせば自動でテーブルが作られるらしい。
https://github.com/symfony/symfony/issues/46609

メッセンジャーをインストール

```bash
$ composer require symfony/messenger
```

メッセンジャーを起動してみる

```bash
$ php bin/console messenger:consume async
```

**「An exception occurred while executing a query: SQLSTATE[42S02]: Base table or view not found: 1146 Table 'symfony_mailer.messenger_messages' doesn't exist」**
![2](/images/symfony/2.png)

また似たような内容で怒られました。
調べてみるとデフォルトの状態だとメッセンジャーで必要なテーブル類が自動生成されないらしい。
自動生成するには.env の auto_setup の値を 0 から 1 に変えれば良いらしい。

```yml
MESSENGER_TRANSPORT_DSN=doctrine://default?auto_setup=1
```

再度メッセンジャーを起動してみる。

```yaml
$ php bin/console messenger:consume async
[OK] Consuming messages from transport "async".
// The worker will automatically exit once it has received a stop signal via the messenger:stop-workers command.
// Quit the worker with CONTROL-C.
// Re-run the command with a -vv option to see logs about consumed messages.
```

メッセンジャーが起動しました！

messenger_messages テーブルも作られていますね。

```yaml
MariaDB [symfony_mailer]> show tables;
+--------------------------+
| Tables_in_symfony_mailer |
+--------------------------+
| messenger_messages       |
+--------------------------+
1 row in set (0.000 sec)
```

再度「/email」にアクセスしてメールを送信してみます。

Symfony Profiler で確認するとメッセンジャーのキューにメールが登録されていますね!
![3](/images/symfony/3.png)
今回はやりませんがこの状態で.env の MAILER_DSN を指定すれば正常にメールが送信されるはずです。

# 問い合わせフォームを作成する

お次は問い合わせフォームを作っていきます。

フォームと symfony の連携周りの話は [mako10](https://qiita.com/mako5656https://qiita.com/mako5656) さんの記事で事足りるので割愛させていただきます。
https://qiita.com/mako5656/items/85b18f8e8fb8cb622f2b
https://qiita.com/mako5656/items/0b6c28901cf0f7edeeaa

```php:ContactController.php
<?php

namespace App\Controller;

use App\Form\Type\ContactType;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use App\Form\Model\ContactModel;
use Symfony\Component\Routing\Annotation\Route;

class ContactController extends AbstractController
{
  #[Route('/contact', methods: ['GET'])]
  public function getContact(): Response
  {
    $contact = new ContactModel();
    $contact->setContactContent('画面がバグってます');

    $form = $this->createForm(ContactType::class, $contact);

    return $this->render('contact.html.twig', [
      'form' => $form,
    ]);
  }
```

```php:ContactModel.php
<?php

namespace App\Form\Model;

class ContactModel
{

  protected $contactContent;
  /**
   * @var UploadedFile[]
   */
  private array $image = [];

  public function getContactContent(): string
  {
    return $this->contactContent;
  }

  public function setContactContent(string $contactContent): void
  {
    $this->contactContent = $contactContent;
  }

  /**
  * @return UploadedFile[]
  */
  public function getImage(): array
  {
    return $this->image;
  }

  /**
  * @param UploadedFile[] $image
  */
  public function setImage(array $image): self
  {
    $this->image = $image;
    return $this;
  }
}
```

```php:ContactType.php
<?php

namespace App\Form\Type;

use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\SubmitType;
use Symfony\Component\Form\Extension\Core\Type\TextType;
use Symfony\Component\Form\Extension\Core\Type\FileType;
use Symfony\Component\Form\FormBuilderInterface;

use App\Form\Model\ContactModel;
use Symfony\Component\OptionsResolver\OptionsResolver;

class ContactType extends AbstractType
{
  public function buildForm(FormBuilderInterface $builder, array $options): void
  {
    $builder
      ->add('contactContent', TextType::class)
      ->add('image', FileType::class, [
        'required' => false,
        'multiple' => true,
      ])
      ->add('save', SubmitType::class);
  }

  public function configureOptions(OptionsResolver $resolver): void
  {
    $resolver->setDefaults([
      'data_class' => ContactModel::class,
    ]);
  }
}
```

```php:contact.html.twig
{% extends 'base.html.twig' %}

{% block title %}お問い合わせページ{% endblock %}

{% block body %}
  {{ form(form) }}
{% endblock %}
```

「/contact」にアクセスするとフォームが表示されます。
![4](/images/symfony/4.png)

# メールテンプレートを使ってメールを送信する

公式ドキュメントを頼りに処理を実装します。
https://symfony.com/doc/current/mailer.html#text-content

```php:ContactController.php
<?php

namespace App\Controller;

use App\Form\Type\ContactType;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use App\Form\Model\ContactModel;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Bridge\Twig\Mime\TemplatedEmail;
use Symfony\Component\Mailer\MailerInterface;

class ContactController extends AbstractController
{
  #[Route('/postContact', methods: ['POST'])]
  public function newPost(Request $request, MailerInterface $mailer): Response
  {
    $contact = new ContactModel();
    $form = $this->createForm(ContactType::class, $contact);
    $form->handleRequest($request);
    if ($form->isSubmitted() && $form->isValid()) {
      $contact = $form->getData();
      $email = (new TemplatedEmail())
        ->from('hello@example.com')
        ->to('you@example.com')
        ->subject('symfony mail test title')
        // メールテンプレート
        ->textTemplate('emails/email.html.twig')
        // メールテンプレートにフォームから送られてきた内容を渡す
        ->context([
          'contact' => $contact,
      ]);
      // ファイルを添付
      foreach ($contact->getImage() as $attachmentFile) {
        $email->attachFromPath(
          $attachmentFile->getRealPath(),
          $attachmentFile->getClientOriginalName(),
        );
      }
      $mailer->send($email);
    }

    return $this->render('index.html.twig', [
      'form' => $form,
    ]);
  }
}
```

以下はメールテンプレートの twig です。

```php:email.html.twig
問い合わせを受け付けました。

■お問い合わせ内容
{{ contact.contactContent }}
```

この状態で「/contact」に post リクエストを送ると・・

「**Serialization of 'Symfony\Component\HttpFoundation\File\UploadedFile' is not allowed**」
![5](/images/symfony/5.png)

メール送信時に UploadedFile がシリアライズできずにエラーが発生しました。

UploadedFile はシリアライズしちゃだめらしいですね。
https://github.com/symfony/symfony/issues/7238

# UploadedFile とはなんぞや？

調べるとフォームからアップロードされたファイルの情報がまとまっている奴らしい。
https://runebook.dev/ja/docs/symfony/symfony/component/httpfoundation/file/uploadedfile

# UploadedFile のシリアライズはどこでされている?

調べるとメールテンプレの twig にコンテキストを渡している所でシリアライズされるらしいです。
公式ドキュメントをよく見るとシリアライズできる物のみ渡せと書いてありますね。
![6](/images/symfony/6.png)

公式ドキュメント通りにファイルをシリアライズの対象から外してみる。

```php:ContactModel.php
<?php

namespace App\Form\Model;

class ContactModel
{
  public function __serialize(): array
  {
    return [
      'contactContent' => $this->contactContent,
    ];
  }

  public function __unserialize(array $data): void
  {
    $this->contactContent = $data['contactContent'];
  }

  protected $contactContent;
  /**
   * @var UploadedFile[]
   */
  private array $image = [];

  public function getContactContent(): string
  {
    return $this->contactContent;
  }

  public function setContactContent(string $contactContent): void
  {
    $this->contactContent = $contactContent;
  }

  /**
  * @return UploadedFile[]
  */
  public function getImage(): array
  {
    return $this->image;
  }

  /**
  * @param UploadedFile[] $image
  */
  public function setImage(array $image): self
  {
    $this->image = $image;
    return $this;
  }
}
```

この状態で「/contact」に post リクエストを送ると・・・・
正常に送信できました！

キューにテンプレ通りの内容が送信されていておりファイルも添付されています。
![7](/images/symfony/7.png)

# 最後に

初めましてのフレームワークは呪文が多く大変です。
同じような状況の人の助けになれば幸いです。
