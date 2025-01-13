all: build up

build:
	docker compose build

up:
	docker compose up

down:
	docker compose down

clean:
	docker system prune -f
	docker compose down --rmi all --volumes

fclean: clean
	docker system prune -f
	docker volume prune -f
	docker network prune -f
	docker image prune -f
	docker container prune -f
	docker builder prune -f

re: fclean all

.PHONY: all build up down clean fclean re