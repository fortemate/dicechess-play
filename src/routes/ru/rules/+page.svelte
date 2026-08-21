<script lang="ts">
	// Русская версия страницы правил (#254). Зеркалит /rules секция в секцию; section ids
	// общие с английской страницей — rules.test.ts проверяет паритет структуры.
	import { resolve } from '$app/paths';
	import { CANONICAL_ORIGIN, SITE_ORIGIN } from '$lib/rules/seo';

	const sections = [
		{ id: 'glance', title: 'Игра в двух словах' },
		{ id: 'dice', title: 'Три кости' },
		{ id: 'turns', title: 'Ваш ход: используйте максимум костей' },
		{ id: 'winning', title: 'Как выиграть' },
		{ id: 'no-check', title: 'Ни шаха, ни мата' },
		{ id: 'special-moves', title: 'Рокировка, превращение, взятие на проходе' },
		{ id: 'draws', title: 'Ничьи' },
		{ id: 'time', title: 'Контроль времени' },
		{ id: 'fair-dice', title: 'Доказуемо честные кости' },
		{ id: 'dialects', title: 'Чем отличаются другие сайты' },
	] as const;
</script>

<svelte:head>
	<title>Правила Dice Chess — как играть | Dice Chess Play</title>
	<meta
		name="description"
		content="Полные правила Dice Chess (шахматы с костями): что означают три кости, правило максимума, рокировка, превращение, взятие на проходе, ничьи, контроль времени и доказуемо честные броски."
	/>
	<link rel="canonical" href="{CANONICAL_ORIGIN}/ru/rules" />
	<link rel="alternate" hreflang="en" href="{CANONICAL_ORIGIN}/rules" />
	<link rel="alternate" hreflang="ru" href="{CANONICAL_ORIGIN}/ru/rules" />
	<link rel="alternate" hreflang="x-default" href="{CANONICAL_ORIGIN}/rules" />
	<meta property="og:type" content="article" />
	<meta property="og:site_name" content="Dice Chess — Play" />
	<meta property="og:title" content="Правила Dice Chess — как играть" />
	<meta
		property="og:description"
		content="Бросьте три кости, сделайте до трёх ходов, возьмите короля. Полные правила Dice Chess — так, как их применяет наш открытый движок."
	/>
	<meta property="og:url" content="{SITE_ORIGIN}/ru/rules" />
	<meta property="og:image" content="{SITE_ORIGIN}/pwa-512x512.png" />
	<meta name="twitter:card" content="summary" />
</svelte:head>

<article class="mx-auto flex w-full max-w-3xl flex-col gap-10" lang="ru">
	<header class="flex flex-col gap-4">
		<div class="flex items-start justify-between gap-4">
			<h1 class="text-3xl font-bold text-content sm:text-4xl">Как играть в Dice Chess</h1>
			<a
				href={resolve('/rules')}
				class="mt-1.5 shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-content-muted transition-colors hover:border-primary hover:text-content"
			>
				English
			</a>
		</div>
		<p class="leading-relaxed text-content-muted">
			Dice Chess — это шахматы, в которые ворвалась удача: три кости решают, какими фигурами можно
			ходить, а партия заканчивается в момент взятия короля. Шахматная интуиция остаётся с вами — и
			вы быстро узнаёте, где она подводит. Партия занимает считанные минуты, и вы можете
			<a class="font-semibold text-primary hover:underline" href={resolve('/play')}>
				сыграть прямо сейчас — бесплатно и без регистрации</a
			>.
		</p>
		<nav aria-label="Содержание" class="rounded-2xl border border-border bg-surface/40 p-4">
			<ul class="flex flex-col gap-1.5 text-sm sm:grid sm:grid-cols-2">
				{#each sections as s (s.id)}
					<li>
						<a class="text-content-muted transition-colors hover:text-content" href="#{s.id}">
							{s.title}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</header>

	<section id="glance" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">Игра в двух словах</h2>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>Доска, фигуры и начальная расстановка — обычные шахматы. Белые ходят первыми.</li>
			<li>
				Каждый ход начинается с броска <b class="text-content">трёх костей</b>. Каждая кость
				показывает тип фигуры: пешка, конь, слон, ладья, ферзь или король.
			</li>
			<li>
				За один ход вы делаете <b class="text-content">до трёх перемещений</b>. Каждое перемещение
				оплачивается одной костью с типом той фигуры, которой вы ходите.
			</li>
			<li>
				Побеждает тот, кто <b class="text-content">возьмёт короля</b>. Шаха и мата нет — король
				просто снимается с доски, как любая другая фигура.
			</li>
		</ul>
	</section>

	<section id="dice" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">Три кости</h2>
		<p class="leading-relaxed text-content-muted">
			Кости бросаются заново в начале каждого хода, до ваших перемещений. Кость «конь» позволяет
			сходить <em>каким-нибудь</em> конём — любым из ваших. Дубли и трипли работают буквально: две кости
			«пешка» — это два пешечных перемещения, разными пешками или одной и той же дважды. Каждая кость
			оплачивает ровно одно перемещение и после этого потрачена до конца хода.
		</p>
		<p class="leading-relaxed text-content-muted">
			Единственное исключение тратит две кости сразу: рокировке нужны и «король», и «ладья» (см.
			<a class="text-primary hover:underline" href="#special-moves">ниже</a>).
		</p>
	</section>

	<section id="turns" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">Ваш ход: используйте максимум костей</h2>
		<p class="leading-relaxed text-content-muted">
			Главное правило нашего диалекта: <b class="text-content">
				вы обязаны потратить столько костей, сколько позволяет позиция</b
			>. Нельзя остановиться раньше и нельзя пропустить кость, которую можно было использовать. Если
			какая-то последовательность перемещений задействует все три кости — каждый легальный ход
			задействует все три; если максимум две — ровно две, и так далее.
		</p>
		<p class="leading-relaxed text-content-muted">
			Это правило кусается. Допустим, партия только началась, и вы выбросили
			<i>пешку, коня и слона</i>. Ход крайней пешкой в духе a2–a3 здесь нелегален: он не открывает
			диагональ, слон остаётся запертым, и одна кость пропадает. Легальны только те пешечные ходы,
			которые выпускают слона (или такие порядки ходов, при которых все три кости всё же тратятся).
			Продумывайте весь ход целиком, прежде чем трогать фигуры.
		</p>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>
				<b class="text-content">Взятие короля сильнее любых правил.</b> Ход, снимающий короля, легален
				всегда — даже если кости остаются неиспользованными — и немедленно заканчивает партию.
			</li>
			<li>
				<b class="text-content">Совсем нет ходов? Пас.</b> Если бросок не даёт ни одного легального
				перемещения — например, <i>слон, ладья, ферзь</i> на самом первом ходу, когда эти фигуры ещё не
				могут двигаться, — ход пропускается автоматически. Это происходит мгновенно и не тратит ваше время
				на часах.
			</li>
			<li>
				Максимум считается <b class="text-content">в костях, а не в перемещениях</b>: рокировка
				тратит две кости одним перемещением и учитывается соответственно.
			</li>
		</ul>
	</section>

	<section id="winning" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">Как выиграть</h2>
		<p class="leading-relaxed text-content-muted">
			Вы выигрываете, когда происходит любое из этого:
		</p>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>
				<b class="text-content">Вы взяли короля.</b> Напасть на него мало — в тот ход, когда вы его берёте,
				нужна кость атакующей фигуры.
			</li>
			<li><b class="text-content">Соперник сдался.</b> Сдаться можно в любой момент.</li>
			<li>
				<b class="text-content">У соперника упал флаг</b> (см.
				<a class="text-primary hover:underline" href="#time">контроль времени</a>).
			</li>
		</ul>
	</section>

	<section id="no-check" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">Ни шаха, ни мата</h2>
		<p class="leading-relaxed text-content-muted">
			Если вы пришли из шахмат, вот что придётся разучить. Партия заканчивается взятием короля,
			поэтому понятия шаха просто не существует:
		</p>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>Король может пойти на атакованное поле и может остаться под боем.</li>
			<li>«Связок» нет — любая фигура может ходить независимо от того, что она открывает.</li>
			<li>Рокировка из-под «шаха», через битое поле и под «шах» полностью легальна.</li>
			<li>Пата нет: игрок без легальных ходов просто пасует, и партия продолжается.</li>
		</ul>
		<p class="leading-relaxed text-content-muted">
			Атакованный король — это опасность, а не состояние в правилах. Сможет ли атакующий довести
			дело до конца, решает следующий бросок — в этом напряжении вся игра.
		</p>
	</section>

	<section id="special-moves" class="flex flex-col gap-5">
		<h2 class="text-xl font-bold text-content sm:text-2xl">
			Рокировка, превращение, взятие на проходе
		</h2>
		<div class="flex flex-col gap-2">
			<h3 class="font-bold text-content">Рокировка</h3>
			<p class="leading-relaxed text-content-muted">
				Для рокировки в одном броске нужны <b class="text-content">
					и кость «король», и кость «ладья»</b
				> — тратятся обе. Это одно перемещение, так что в ход с рокировкой всё ещё помещается ещё одно
				перемещение третьей костью. Обычные шахматные условия сохраняются — король и эта ладья ещё не
				ходили, поля между ними свободны, — но атакованность полей не имеет никакого значения. Партии
				начинаются только из классической расстановки (Chess960 у нас нет).
			</p>
		</div>
		<div class="flex flex-col gap-2">
			<h3 class="font-bold text-content">Превращение</h3>
			<p class="leading-relaxed text-content-muted">
				Ход пешкой на последнюю горизонталь оплачивается костью «пешка», и превращение обязательно:
				выбирайте ферзя, ладью, слона или коня (короля — нельзя). Осторожно: правило максимума может
				выбрать за вас — если только одна фигура превращения позволяет потратить оставшиеся кости,
				легально только это превращение. И особый случай: если на поле превращения стоит вражеский
				король, пешка просто берёт его, и партия выиграна — превращения не происходит.
			</p>
		</div>
		<div class="flex flex-col gap-2">
			<h3 class="font-bold text-content">Взятие на проходе</h3>
			<p class="leading-relaxed text-content-muted">
				Как и в шахматах, пешку, шагнувшую на два поля, можно взять на проходе — костью «пешка».
				Право сохраняется <b class="text-content">весь следующий ход соперника</b> — взять на проходе
				можно любым из его трёх перемещений, не только первым. А поскольку за один ход можно продвинуть
				на два поля несколько пешек, взятий на проходе может быть доступно сразу несколько.
			</p>
		</div>
	</section>

	<section id="draws" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">Ничьи</h2>
		<div class="flex flex-col gap-2">
			<h3 class="font-bold text-content">Ничья по соглашению</h3>
			<p class="leading-relaxed text-content-muted">
				Предложение ничьей подаётся вместе с вашим завершённым ходом — оно «едет» с вашими
				перемещениями. Соперник обязан ответить <b class="text-content">
					до того, как откроются его кости</b
				>: согласие — и партия заканчивается на месте; отказ — и только тогда бросаются его кости.
				Пока соперник думает, идут его часы, а проигнорированное предложение — это просто риск
				просрочки: подсмотреть бросок заранее невозможно. После отклонённого предложения вы не
				можете предлагать снова, пока предложение не сделает соперник.
			</p>
		</div>
		<div class="flex flex-col gap-2">
			<h3 class="font-bold text-content">Автоматические ничьи</h3>
			<p class="leading-relaxed text-content-muted">
				Партия автоматически признаётся ничьей после <b class="text-content">
					100 перемещений подряд без взятий и без ходов пешками</b
				> — аналог шахматного правила 50 ходов, но счёт идёт по отдельным перемещениям (а их в ходе до
				трёх), так что наступает он раньше, чем ждёт шахматист. Существует и предохранительный потолок
				длины партии — далеко за пределами любой реальной игры.
			</p>
			<p class="leading-relaxed text-content-muted">
				<b class="text-content">Ничьей по повторению нет</b>, правила
				<b class="text-content">«недостаточного материала» тоже нет</b> — одинокий король может выиграть
				по времени.
			</p>
		</div>
	</section>

	<section id="time" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">Контроль времени</h2>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>
				Живые партии играются с часами. В лобби доступны блиц (3+2, 5+3, 5+5, 5&nbsp;мин) и рапид
				(10+5, 10+10, 15+10, 10&nbsp;мин).
			</li>
			<li>
				Добавка времени начисляется <b class="text-content">один раз за завершённый ход</b>, а не за
				каждое перемещение внутри него.
			</li>
			<li>Вынужденный пас мгновенен и бесплатен — пропущенный ход не тратит время.</li>
			<li>
				Раздумья над предложением ничьей идут за счёт ваших часов, как и любое другое решение.
			</li>
			<li>
				<b class="text-content">Упавший флаг — всегда поражение.</b> Исключения «недостаточный материал»
				нет: просрочили время против одинокого короля — проиграли.
			</li>
			<li>
				При разрыве соединения у вас есть около 30 секунд, чтобы вернуться; после этого партия
				засчитывается как поражение.
			</li>
		</ul>
	</section>

	<section id="fair-dice" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">Доказуемо честные кости</h2>
		<p class="leading-relaxed text-content-muted">
			Нашим костям не нужно верить на слово — их можно проверить. Перед началом партии сервер
			публикует криптографическое обязательство (хеш SHA-256) на секретный сид. Затем оба игрока
			добавляют собственные случайные сиды. Каждый бросок партии детерминированно выводится из этих
			сидов и номера хода — кости зафиксированы до первого хода и не могут зависеть от позиции,
			ваших ходов или того, кто выигрывает. В момент окончания партии сервер раскрывает свой сид, и
			любой может пересчитать все броски и убедиться, что они совпадают с опубликованным заранее
			обязательством.
		</p>
		<p class="leading-relaxed text-content-muted">
			На странице реплея каждой завершённой живой партии показаны обязательство, раскрытый сид и
			сиды обоих игроков — готовые к копированию. Полная процедура проверки с работающим кодом — в
			<a
				class="text-primary hover:underline"
				href="https://bots.fortemate.com/provably-fair/"
				rel="external"
			>
				нашей документации provably-fair</a
			> (на английском).
		</p>
	</section>

	<section id="dialects" class="flex flex-col gap-3">
		<h2 class="text-xl font-bold text-content sm:text-2xl">Чем отличаются другие сайты</h2>
		<p class="leading-relaxed text-content-muted">
			В Dice Chess играют на нескольких сайтах, и правила местами расходятся — в основном в том, что
			надстроено поверх ходов, а не в самих ходах. Эта страница описывает диалект, который применяет
			наш открытый
			<a
				class="text-primary hover:underline"
				href="https://github.com/fortemate/dicechess-engine"
				rel="external"
			>
				движок</a
			>; вот как выглядят сайты, которые мы изучили.
		</p>
		<ul class="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-content-muted">
			<li>
				<b class="text-content">dicechess.com</b> — базовые правила ходов совпадают с нашим диалектом,
				включая правило максимума и рокировку за две кости; мы проверили это, проиграв десятки тысяч его
				публичных партий через наш движок, ход в ход. Поверх ходов там добавлены куб удвоения в стиле
				нард и ставки в банк, так что партия может закончиться и отказом от удвоения.
			</li>
			<li>
				<b class="text-content">beturanga.com</b> — партии из нашей выборки, и классические, и Chess960,
				также воспроизводятся по правилам нашего диалекта без расхождений. Дополнительно там есть позиции
				Фишера (Chess960), которых у нас нет, и форматы игры на деньги.
			</li>
			<li>
				<b class="text-content">Наш сайт</b> — описанный выше эталонный диалект, без ставок и без куба:
				классическая расстановка, рокировка за две кости, обязательный максимум, взятие на проходе весь
				ответный ход, доказуемо честные броски.
			</li>
		</ul>
		<p class="leading-relaxed text-content-muted">
			Нашли расхождение в правилах, которое мы не описали — здесь или на другом сайте? Пожалуйста,
			<a
				class="text-primary hover:underline"
				href="https://github.com/fortemate/dicechess-play/issues"
				rel="external"
			>
				откройте issue</a
			> — точная документация диалектов входит в миссию проекта.
		</p>
	</section>

	<section
		class="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface/40 p-6 text-center"
	>
		<h2 class="text-xl font-bold text-content">Бросим кости?</h2>
		<p class="max-w-xl leading-relaxed text-content-muted">
			Быстрее всего правила усваиваются за доской: партия занимает пару минут, а сайт просто не даст
			сделать нелегальный ход.
		</p>
		<div class="flex flex-wrap items-center justify-center gap-3">
			<a
				href={resolve('/play')}
				class="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-content transition-colors hover:bg-primary-hover"
			>
				Играть
			</a>
			<a
				href={resolve('/lobby')}
				class="rounded-xl border border-border px-5 py-2.5 text-sm font-bold text-content-muted transition-colors hover:border-primary hover:text-content"
			>
				Сыграть с человеком
			</a>
		</div>
	</section>
</article>
