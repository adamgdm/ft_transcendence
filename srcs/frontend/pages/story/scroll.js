let currentSection = 0
const sections = document.querySelectorAll('section')
const totalSections = sections.length

let isScrolling = false
const scrollCooldown = 600 // Milliseconds to wait between scrolls
let lastTimeScroll = Date.now()



function scrollToSection(index) {
    if (index >= 0 && index < totalSections) {
        currentSection = index

        sections[currentSection].scrollIntoView ({
            behavior: 'smooth'
        })
    }

    if (currentSection !== 0 && currentSection !== totalSections - 1) {
        setTimeout(() => {
            isScrolling = false
        }, scrollCooldown)
    }
}

window.addEventListener('wheel', (event) => {
    event.preventDefault()


    const currentTime = Date.now()
    if (isScrolling || currentTime - lastTimeScroll < scrollCooldown)
        return

    lastTimeScroll = Date.now()

    if (event.deltaY > 0) {

        if (currentSection < totalSections - 1)
            scrollToSection(currentSection + 1)
    }
    else {

        if (currentSection > 0)
            scrollToSection(currentSection - 1)
    }
}, { passive: false })


window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      if (currentSection < totalSections - 1) {
        scrollToSection(currentSection + 1);
      }
    } else if (event.key === 'ArrowUp') {
      if (currentSection > 0) {
        scrollToSection(currentSection - 1);
      }
    }
  });
  