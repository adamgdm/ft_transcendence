export function AnimationAction() {


    // Animation utilities for Galaxy Pong
    class GalaxyAnimations {
        constructor() {
            // Cache DOM elements
            this.meteoroids = {
                left: document.querySelectorAll('.left-meteoroid'),
                right: document.querySelectorAll('.right-meteoroid')
            };
            this.planets = {
                alpha: document.getElementById('planet-alpha'),
                opponent: document.getElementById('planet-opponent'),
                watcher: document.getElementById('planet-watcher'),
                omega: document.querySelector('.planet-omega')
            };
            this.rackets = {
                left: document.querySelectorAll('.left-racket'),
                right: document.querySelectorAll('.right-racket')
            };
            this.title = document.getElementById('main-title')
            
            this.initializeAnimations();
        }

        initializeAnimations() {
            // Add floating animation to planets
            this.addFloatingEffect(this.planets.alpha)
            this.addFloatingEffect(this.planets.opponent)
            this.addFloatingEffect(this.planets.watcher, 1.5)
            this.addFloatingEffect(this.planets.omega)

            // Add meteoroid animations
            this.addMeteoroidEffects()

            this.addRacketAnimations()

        
        }

        addFloatingEffect(element, duration = 2) {
            if (!element) return;
            
            element.style.animation = `float ${duration}s ease-in-out infinite`
            
            // Add keyframes if they don't exist
            if (!document.querySelector('#floatingKeyframes')) {
                const keyframes = `
                    @keyframes float {
                        0% { transform: translateY(0px) rotate(0deg); }
                        50% { transform: translateY(-20px) rotate(3deg); }
                        100% { transform: translateY(0px) rotate(0deg); }
                    }
                `;
                const style = document.createElement('style')
                style.id = 'floatingKeyframes'
                style.textContent = keyframes
                document.head.appendChild(style)
            }
        }

        addMeteoroidEffects() {
            const meteoroidKeyframes = `
                @keyframes meteoroidFloat {
                    0% { transform: translate(0, 0) rotate(0deg); }
                    50% { transform: translate(-10px, 10px) rotate(-5deg); }
                    100% { transform: translate(0, 0) rotate(0deg); }
                }
            `;
            
            this.addStylesheet('meteoroidKeyframes', meteoroidKeyframes);
            
            this.meteoroids.left.forEach(meteoroid => {
                meteoroid.style.animation = 'meteoroidFloat 3s ease-in-out infinite';
            });
            
            this.meteoroids.right.forEach(meteoroid => {
                meteoroid.style.animation = 'meteoroidFloat 3s ease-in-out infinite reverse';
            });
        }


        addRacketAnimations() {
            const racketKeyframes = `
                @keyframes racketFloat {
                    0% { transform: translate(0, 0) rotate(0deg); }
                    50% { transform: translate(-5px, -10px) rotate(-2deg); }
                    100% { transform: translate(0, 0) rotate(0deg); }
                }
                
                @keyframes racketFloatRight {
                    0% { transform: translate(0, 0) rotate(0deg); }
                    50% { transform: translate(5px, -10px) rotate(2deg); }
                    100% { transform: translate(0, 0) rotate(0deg); }
                }
                
                @keyframes racketHover {
                    0% { filter: brightness(1); }
                    50% { filter: brightness(1.3); }
                    100% { filter: brightness(1); }
                }
            `;
            
            this.addStylesheet('racketKeyframes', racketKeyframes);
            
            // Apply floating animations to left rackets
            this.rackets.left.forEach(racket => {

                if (!racket) return;

                racket.style.animation = 'racketFloat 4s ease-in-out infinite';
                
            })
            
            // Apply floating animations to right rackets
            this.rackets.right.forEach(racket => {

                if (!racket) return;

                racket.style.animation = 'racketFloatRight 4s ease-in-out infinite';

        })
    }

        addStylesheet(id, content) {
            if (!document.querySelector(`#${id}`)) {
                const style = document.createElement('style');
                style.id = id;
                style.textContent = content;
                document.head.appendChild(style);
            }
        }
    }

    // Initialize animations
    document.addEventListener('DOMContentLoaded', () => {
        const galaxyAnimations = new GalaxyAnimations()
    });

}