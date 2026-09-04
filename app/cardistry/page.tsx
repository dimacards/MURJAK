import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { CardistryTimeline } from "@/components/CardistryTimeline";
import { Reveal } from "@/components/Reveal";
import { ScrollTop } from "@/components/ScrollTop";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "История кардистри",
  description:
    "История кардистри — или как сложность уступила место визуальности.",
};

/**
 * Эпохи. word — фантомное слово на фоне. timeline — годы-стержень секции:
 * у некоторых лет есть маленький кадр-артефакт (img), у некоторых нет.
 */
const eras = [
  {
    kicker: "Эпоха 1",
    title: "Прото-кардистри и XCM",
    years: "до 1985 – 2003",
    word: "XCM",
    vword: "ERA 1",
    timeline: [
      {
        year: "<1985",
        event:
          "журнал the apocalypse: «illogical shuffle» — одно из первых задокументированных украшательских движений с картами",
        img: "/cardistry/era1/c.png",
        align: "right" as const,
      },
      {
        year: "1992",
        event:
          "крис кеннер публикует sybil cut — движение, ставшее азбукой кардистри",
        img: "/cardistry/era1/sybil.png",
      },
      {
        year: "1999",
        event:
          "dvd «show off» брайана тюдора — первый релиз целиком про флориши",
        img: "/cardistry/era1/b.png",
        align: "right" as const,
      },
      {
        year: "2001",
        event:
          "дево основывает handlordz — центр xcm, культуры предельной сложности и техничности",
        img: "/cardistry/era1/handlordz.webp",
      },
      {
        year: "2003",
        event:
          "xcm уходит на второй план: на первый план выходит более визуальное понимание жанра",
        img: null,
      },
    ],
  },
  {
    kicker: "Эпоха 2",
    title: "«Классическое» кардистри",
    years: "2004 – 2013",
    word: "TRILOGY",
    vword: "ERA 2",
    timeline: [
      {
        year: "2004",
        event:
          "братья бак (dan & dave) выпускают свою систему — точку отсчёта «классического» кардистри",
        img: null,
      },
      {
        year: "2007",
        event:
          "«the trilogy» закрепляет новый язык: акцент на мелких нюансах вместо масштабных движений",
        img: "/cardistry/era2/trilogy.avif",
      },
      {
        year: "2008",
        event:
          "колода smoke & mirrors — у жанра появляется собственная визуальная культура",
        img: "/cardistry/era2/smoke.png",
        align: "right" as const,
      },
      {
        year: "2012",
        event:
          "virtuoso — первая колода, спроектированная специально под кардистри",
        img: "/cardistry/era2/virtuoso.jpg",
      },
      {
        year: "2013",
        event:
          "world cardistry championship: победа за счёт нового подхода к съёмке — кардистри становится самостоятельным медиа",
        img: null,
        align: "left" as const,
      },
    ],
  },
  {
    kicker: "Эпоха 3",
    title: "Пост-кардистри",
    years: "2013 – ?",
    word: "FONTAINE",
    vword: "ERA 3",
    timeline: [
      {
        year: "2013",
        event:
          "чёрные fontaine (зак мюллер): новые элементы и diy-подход, влияние стритвира и скейт-культуры",
        img: "/cardistry/era3/fontaine.webp",
      },
      {
        year: "2014",
        event:
          "первый cardistry-con: сообщество и гармония стилей; минимализм и электронная музыка",
        img: "/cardistry/era3/con.png",
        align: "right" as const,
      },
      {
        year: "2016",
        event:
          "новые бренды anyone и lotus in hand — кардистри обрастает собственной модой",
        img: "/cardistry/era3/anyone.webp",
      },
      {
        year: "2017",
        event:
          "cardestroy: буквальная деформация карт ради визуала — переосмысление жанра",
        img: "/cardistry/era3/cardestroy.jpg",
        align: "right" as const,
      },
      {
        year: "2020",
        event:
          "fontaine trials и большие онлайн-события выводят кардистри к новому витку признания",
        img: "/cardistry/era3/trials.jpg",
      },
      {
        year: "2024",
        event:
          "коллаборации с брендами и художниками, печатные журналы о жанре (the flourish)",
        img: "/cardistry/era3/flourish.png",
        align: "right" as const,
      },
    ],
  },
];

/**
 * Лонгрид «История кардистри».
 * Эпохи построены вокруг горизонтального таймлайна с годами-стержнем.
 * Magic-эффект и финал пока в прежнем каркасе — раскатаем дальше.
 */
export default function CardistryPage() {
  return (
    <>
      <ScrollTop />
      <main className={styles.page}>
        <div className={styles.grain} aria-hidden="true" />

        {/* 1. Обложка */}
        <header className={styles.cover}>
          <span className={styles.phantom} aria-hidden="true">
            CARDISTRY
          </span>
          <div className={styles.coverInner}>
            <Reveal as="h1" className={styles.coverTitle}>
              История
              <br />
              кардистри
            </Reveal>
          </div>
        </header>

        {/* 2. Введение — определение с иерархией (как было раньше) */}
        <section className={styles.intro}>
          <Reveal as="h2" className={styles.introLede}>
            <span className={styles.introWord}>Кардистри</span>
            <span className={styles.introDef}>
              искусство манипуляций с игральными картами
            </span>
          </Reveal>
          <Reveal as="p" className={styles.introBody} delay={150}>
            Здесь важен не трюк и не секрет, а эстетика, визуальный язык и
            «значимая форма» движений: то, как карты раскрываются, складываются и
            перетекают из одной фигуры в другую
          </Reveal>
        </section>

        {/* 3–5. Эпохи (таймлайн как структура). Эра 2 — эталон отступов;
            эра 1 и 3 плотнее (dense), т.к. там больше воздуха. */}
        {eras.map((e, i) => (
          <section key={e.word} className={styles.era}>
            <span className={styles.phantom} aria-hidden="true">
              {e.word}
            </span>
            <span className={styles.vphantom} aria-hidden="true">
              {e.vword}
            </span>

            <Reveal className={styles.eHead}>
              <h2 className={styles.eTitle}>{e.title}</h2>
            </Reveal>

            <CardistryTimeline items={e.timeline} dense={i !== 1} />
          </section>
        ))}

        {/* 6. Финал — открытый вопрос про будущее жанра */}
        <section className={styles.final}>
          <span className={styles.phantom} aria-hidden="true">
            FUTURE
          </span>
          <Reveal as="p" className={styles.finalQ}>
            Куда движется кардистри?
          </Reveal>
        </section>
      </main>
      <Footer />
    </>
  );
}
