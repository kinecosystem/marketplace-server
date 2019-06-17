pipeline {
    agent any
    environment {
        STELLAR_ADDRESS = '$(aws ssm get-parameter --region eu-west-1 --name /CI/Jenkins/STELLAR_ADDRESS | jq -r ".Parameter.Value")'
        STELLAR_BASE_SEED = '$(aws ssm get-parameter --region eu-west-1 --name /CI/Jenkins/STELLAR_BASE_SEED | jq -r ".Parameter.Value")'
        CLUSTER_URL = '$(aws ssm get-parameter --region eu-west-1 --name /CI/Jenkins/CLUSTER_URL | jq -r ".Parameter.Value")'

    }

    stages {
        stage('Checkout') {
            steps {
                  git(
                       url: 'https://github.com/kinecosystem/marketplace-server.git',
                       branch: "${BRANCH}"
                   )
            }
        }
        stage('Create secrets for tests') {
        // todo: should be on the test docker only!

            steps {
                echo 'Creating secrets for tests'
                sh "mkdir -p ./secrets/ && echo export STELLAR_BASE_SEED=$STELLAR_BASE_SEED STELLAR_ADDRESS=$STELLAR_ADDRESS > ./secrets/.secrets"
            }
        }
        stage('Create-jwt-keys') {
            steps {
                echo 'Compiling'
                sh 'make create-jwt-keys'
            }
        }
        stage('Unit Test') {
            steps {
                echo 'Unit testing'
                echo 'Todo: place holder for unit tests'
            }
        }
        stage ('Code Quality'){
            steps {
                echo 'Todo: placeholder for codecov/sonarcube'
                echo 'Todo: Quality and security plugins (FindBugs, CheckMarx, etc.)'
            }
        }
        stage('Create Docker Image') {
            steps {
                echo 'Creating docker image'
                sh 'make build-image'
            }
        }
        stage('Deploy to env') {
            steps {
                // get k8s environment
                script {
                    env['K8S_CLUSTER_URL'] = sh (
                            script: "echo $CLUSTER_URL",
                            returnStdout: true
                       ).trim()
                }
                echo "Deploying env to: $env.K8S_CLUSTER_URL"

                withKubeConfig([credentialsId: 'default2',
                serverUrl: env.K8S_CLUSTER_URL,
                clusterName: 'test'
                ]) {
                    sh '''
                        #create namespace if doesn't exists
                        cat namespace.yaml | sed 's/\$ENVIRONMENT'"/ci/g"  |kubectl apply -f - || true
                        #remove
                        cat marketplace-public-deployment.yaml | sed  "s/\$ENVIRONMENT/CI/;s/\$SSM_PATH/\/CI\/marketplace\// ;s/\$VERSION/latest/" | kubectl apply  -f -
                    '''
                    }

            }
        }
        stage('Integration/System tests') {
            steps {
                echo 'Todo: Testing'
            }
        }
    }
}
