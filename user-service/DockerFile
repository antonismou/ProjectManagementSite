FROM python:3.11-slim
WORKDIR /app
COPY main.py .
# install mysql connector used to persist data in MySQL
RUN pip install mysql-connector-python
EXPOSE 8080
CMD ["python", "main.py"]
