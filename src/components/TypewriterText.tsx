import { useState, useEffect } from "react";

export function TypewriterText({ strings }: { strings: string[] }) {
  const [currentStringIndex, setCurrentStringIndex] = useState(0);
  const [currentText, setCurrentText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const typeSpeed = 50;
    const deleteSpeed = 30;
    const pauseTime = 2000;

    const currentString = strings[currentStringIndex];

    let timeout: NodeJS.Timeout;

    if (!isDeleting && currentText === currentString) {
      // Pause before deleting
      timeout = setTimeout(() => setIsDeleting(true), pauseTime);
    } else if (isDeleting && currentText === "") {
      // Move to next string
      setIsDeleting(false);
      setCurrentStringIndex((prev) => (prev + 1) % strings.length);
    } else {
      // Typing or deleting
      const nextText = isDeleting
        ? currentString.substring(0, currentText.length - 1)
        : currentString.substring(0, currentText.length + 1);

      timeout = setTimeout(
        () => {
          setCurrentText(nextText);
        },
        isDeleting ? deleteSpeed : typeSpeed,
      );
    }

    return () => clearTimeout(timeout);
  }, [currentText, isDeleting, currentStringIndex, strings]);

  return (
    <span className="inline-flex items-center min-h-[3rem]">
      <span className="text-xl md:text-2xl text-muted font-medium">
        {currentText}
      </span>
      <span className="w-[2px] h-6 md:h-8 bg-primary ml-1 animate-pulse"></span>
    </span>
  );
}
