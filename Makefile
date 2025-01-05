all: build up

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

clean:
	docker compose down --rmi all --volumes

fclean: clean
	docker system prune -f

re: fclean all

.PHONY: all build up down clean fclean re