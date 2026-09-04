"use client";

import { useEffect } from "react";

/**
 * Прокрутка в самый верх при заходе на страницу. Нужно из-за глобального
 * history.scrollRestoration = "manual" (его ставит главная для снап-механики):
 * без этого при переходе на /cardistry иногда оставалась прежняя позиция и
 * сразу показывался блок эпохи, а не обложка.
 */
export function ScrollTop() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return null;
}
